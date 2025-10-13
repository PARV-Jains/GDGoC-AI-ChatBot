import {
  GoogleGenAI,
  Chat,
  FunctionDeclaration,
  Type,
  FunctionCall,
  Part,
GenerateContentResponse,
} from "@google/genai";
import fetch from 'node-fetch';

import type { Channel, Event, MessageResponse, StreamChat } from "stream-chat";
// import { AgentSession } from '@livekit/agents';


interface ToolOutput {
  functionResponse: {
    name: string;
    response: any;
  };
}

const webSearchFunctionDeclaration: FunctionDeclaration = {
  name: "web_search",
  description:
    "Search the web for current information about GDGOC IET DAVV events, workshops, or general tech news.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: "The search query, e.g., 'latest events at GDGOC IET DAVV'",
      },
    },
    required: ["query"],
  },
};

const imageAnalysisFunctionDeclaration: FunctionDeclaration = {
  name: "analyze_image",
  description: "Analyzes an image to describe its contents or extract features.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      image_url: {
        type: Type.STRING,
        description: "The URL of the image to analyze.",
      },
    },
    required: ["image_url"],
  },
};


// const voicesession = new AgentSession({
//     // Use the best available model for Spanish
//     stt: "auto:es",
// })

// ADD this helper function to fetch a URL and convert it to a Gemini Part
async function urlToGenerativePart(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image from URL: ${url}`);
  }
  const buffer = await response.arrayBuffer();
  const base64Data = Buffer.from(buffer).toString("base64");
  const mimeType = response.headers.get('content-type');

  if (!mimeType || !mimeType.startsWith('image/')) {
    throw new Error(`URL did not point to a valid image. Mime type: ${mimeType}`);
  }

  return {
    inlineData: {
      mimeType,
      data: base64Data,
    },
  };
}



export class GEMINIResponseHandler {
     private message_text = "";
  private chunk_counter = 0;
  private run_id = "";
  private is_done = false;
  private last_update_time = 0;


  constructor(
private readonly ai: GoogleGenAI,
    private readonly chatSession: Chat,
    // private readonly GenerateContentResponse: GenerateContentResponse,
    private readonly initialMessage: { text: string; imageUrl?: string },
    private readonly chatClient: StreamChat,
    private readonly channel: Channel,
    private readonly message: MessageResponse,
    private readonly onDispose: () => void
  ) {
    this.chatClient.on("ai_indicator.stop", this.handleStopGenerating);
     this.run_id = this.message.id; 
  }

     run = async () => {
    const { cid, id: message_id } = this.message;
    let userMessage = this.initialMessage.text;
    let toolOutputs: ToolOutput[] = [];
    let isCompleted = false;

    // The chat loop continues until a full response without function calls is streamed
    try {
      while (!isCompleted) {
        // 1. Prepare parts for the request
         const requestParts: Part[] = [];
         if (this.initialMessage.imageUrl && toolOutputs.length === 0) {
          try {
            const imagePart = await urlToGenerativePart(this.initialMessage.imageUrl);
            requestParts.push(imagePart);
          } catch (error) {
            console.error("Error processing image URL:", error);
            await this.handleError(new Error("Failed to process the uploaded image."));
            return;
          }
        }
           if (userMessage) {
          requestParts.push({ text: userMessage });
        }
        // const requestParts: Part[] = [{ text: userMessage }];
        if (toolOutputs.length > 0) {
          // If we have tool outputs, we send them to the model
          requestParts.push(
            ...toolOutputs.map((output) => ({
              functionResponse: output.functionResponse,
            }))
          );
          toolOutputs = []; // Clear outputs for the next iteration
        }

           if (requestParts.length === 0) {
            isCompleted = true;
            this.handleCompletion();
            continue;
        }

        // 2. Start streaming the response
     const stream = await this.chatSession.sendMessageStream({
    message: requestParts,
    config: {
        tools: [{ functionDeclarations: [webSearchFunctionDeclaration,imageAnalysisFunctionDeclaration ] }],
    },
});
//  const stream = await this.chatSession.sendMessageStream(requestParts);

        // Indicate generation started
        this.channel.sendEvent({
          type: "ai_indicator.update",
          ai_state: "AI_STATE_GENERATING",
          cid: cid,
          message_id: message_id,
        });

        let functionCalls: FunctionCall[] = [];
        let accumulatedText = "";

        // 3. Process stream chunks
        for await (const chunk of stream) {
          if (chunk.text) {
            accumulatedText += chunk.text;
            this.handleDelta(chunk.text);
          }

          if (chunk.functionCalls) {
            functionCalls.push(...chunk.functionCalls);
          }
        }

        this.message_text = accumulatedText; // Final update to message_text

        // 4. Handle function calls or completion
        if (functionCalls.length > 0) {
          // Model requested a function call
          this.channel.sendEvent({
            type: "ai_indicator.update",
            ai_state: "AI_STATE_EXTERNAL_SOURCES",
            cid: cid,
            message_id: message_id,
          });

          toolOutputs = [];
           for (const call of functionCalls) {
            if (call.name === "web_search") {
              
              // ⭐️ FIX: Check for call.args and args.query before proceeding
              if (!call.args || typeof call.args.query !== 'string') {
                console.error("Web search call is missing required 'query' argument.");
                toolOutputs.push({
                  functionResponse: {
                    name: "web_search",
                    response: { error: "Missing required 'query' argument" },
                  },
                });
                continue; // Skip to the next function call
              }
              
              const args = call.args; // Now args is guaranteed to exist
              
              try {
                // Accessing args.query is safe now
                const searchResult = await this.performWebSearch(
                  args.query as string 
                );

                toolOutputs.push({
                  functionResponse: {
                    name: "web_search",
                    response: JSON.parse(searchResult),
                  },
                });
              } catch (e) {
                // ... (existing error handling for search failure) ...
                console.error(
                  "Error parsing tool arguments or performing web search",
                  e
                );
                toolOutputs.push({
                  functionResponse: {
                    name: "web_search",
                    response: { error: "failed to call tool" },
                  },
                });
              }
            }
          }

          // Continue the loop to submit tool outputs to the model
          userMessage = ""; // The next turn is submitting tool output, no new user text
        } else {
          // No function calls, the response is complete
          isCompleted = true;
          this.handleCompletion();
        }
      }
    } catch (error) {
      console.error("An error occurred during the run:", error);
      await this.handleError(error as Error);
    } finally {
      await this.dispose();
    }
  };

   private handleDelta = (textDelta: string) => {
    const { id } = this.message;
    this.message_text += textDelta;
    const now = Date.now();
    // Update the message in Stream Chat periodically to show streaming effect
    if (now - this.last_update_time > 1000) {
      this.chatClient.partialUpdateMessage(id, {
        set: { text: this.message_text },
      });
      this.last_update_time = now;
    }
  };

private handleCompletion = () => {
    const { cid, id } = this.message;
    // Final update with the complete text
    this.chatClient.partialUpdateMessage(id, {
      set: { text: this.message_text },
    });
    // Clear the AI indicator
    this.channel.sendEvent({
      type: "ai_indicator.clear",
      cid: cid,
      message_id: id,
    });
  };

    dispose = async () => {
    if (this.is_done) {
      return;
    }
    this.is_done = true;
    this.chatClient.off("ai_indicator.stop", this.handleStopGenerating);
    this.onDispose();
  };

private handleStopGenerating = async (event: Event) => {
    if (this.is_done || event.message_id !== this.message.id) {
      return;
    }

    console.log("Stop generating for message", this.message.id);

    await this.channel.sendEvent({
      type: "ai_indicator.clear",
      cid: this.message.cid,
      message_id: this.message.id,
    });
    await this.dispose();
  };

  private handleError = async (error: Error) => {
    if (this.is_done) {
      return;
    }
    await this.channel.sendEvent({
      type: "ai_indicator.update",
      ai_state: "AI_STATE_ERROR",
      cid: this.message.cid,
      message_id: this.message.id,
    });
    await this.chatClient.partialUpdateMessage(this.message.id, {
      set: {
        text: `**Error:** ${error.message ?? "Error generating the message"}`,
      },
    });
    await this.dispose();
  };

    private performWebSearch = async (query: string): Promise<string> => {
    const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

    if (!TAVILY_API_KEY) {
      return JSON.stringify({
        error: "Web search is not available. API key not configured.",
      });
    }

    console.log(`Performing web search for: "${query}"`);

    try {
      // Using global fetch here, assuming a Node.js environment with fetch support
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
      Authorization: `Bearer ${TAVILY_API_KEY}`,
        },
        body: JSON.stringify({
          query: query,
          search_depth: "advanced",
          max_results: 5,
          include_answer: true,
          include_raw_content: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Tavily search failed for query "${query}":`, errorText);
        return JSON.stringify({
          error: `Search failed with status: ${response.status}`,
          details: errorText,
        });
      }

      const data = await response.json();
      console.log(`Tavily search successful for query "${query}"`);

      return JSON.stringify(data);
    } catch (error) {
      console.error(
        `An exception occurred during web search for "${query}":`,
        error
      );
      return JSON.stringify({
        error: "An exception occurred during the search.",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };
}

