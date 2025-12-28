import {
  GoogleGenAI,
  Chat,
  FunctionDeclaration,
  Type,
  Part,
} from '@google/genai';
import type { Channel, DefaultGenerics, Event, StreamChat } from 'stream-chat';
import type { AIAgent } from '../types.js';
// import { AgentSession } from '@livekit/agents';

import { GEMINIResponseHandler } from './GeminiResponseHandler.js'; // Assuming this is your refactored handler

// 1. Define the function declaration once for reuse
const webSearchFunctionDeclaration: FunctionDeclaration = {
  name: 'web_search',
  description:
    'Search the web for current information about GDGOC IET DAVV events, workshops, or official updates on the GDGOC sites.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description:
          "The search query, e.g., 'latest events at GDGOC IET DAVV'",
      },
    },
    required: ['query'],
  },
};

// const voicesession = new AgentSession({
//     // Use the best available model for Spanish
//     stt: "auto:es",
// })

const imageAnalysisFunctionDeclaration: FunctionDeclaration = {
  name: 'analyze_image',
  description:
    'Analyzes an image to describe its contents or extract features.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      image_url: {
        type: Type.STRING,
        description: 'The URL of the image to analyze.',
      },
    },
    required: ['image_url'],
  },
};

const driveImageSearchFunctionDeclaration: FunctionDeclaration = {
  name: 'drive_image_search',
  description:
    'Search the indexed GDGOC IET DAVV Drive images and captions for relevant results.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'Search query for the Drive image index.',
      },
      limit: {
        type: Type.NUMBER,
        description: 'Max number of images to return (default 5).',
      },
    },
    required: ['query'],
  },
};

const csvSearchFunctionDeclaration: FunctionDeclaration = {
  name: 'csv_search',
  description:
    'Search the indexed GDGOC IET DAVV CSV datasets for structured answers.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'Search query for the CSV index.',
      },
      limit: {
        type: Type.NUMBER,
        description: 'Max number of records to return (default 5).',
      },
    },
    required: ['query'],
  },
};

const jsonSearchFunctionDeclaration: FunctionDeclaration = {
  name: 'json_search',
  description:
    'Search the indexed GDGOC IET DAVV JSON datasets for structured answers.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'Search query for the JSON index.',
      },
      limit: {
        type: Type.NUMBER,
        description: 'Max number of records to return (default 5).',
      },
    },
    required: ['query'],
  },
};

const qaSearchFunctionDeclaration: FunctionDeclaration = {
  name: 'qa_search',
  description: 'Search the indexed GDGOC IET DAVV QA pairs for a direct answer.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'Search query for the QA index.',
      },
      limit: {
        type: Type.NUMBER,
        description: 'Max number of records to return (default 3).',
      },
    },
    required: ['query'],
  },
};
export class GeminiAgent implements AIAgent {
  // Renamed from openai to ai (GoogleGenAI instance)
  private ai?: GoogleGenAI;
  // Replaced OpenAI Thread/Assistant with a single Gemini Chat Session
  private chatSession?: Chat;
  private lastInteractionTs = Date.now();

  private handlers: GEMINIResponseHandler[] = []; // Handlers now use the Gemini type

  constructor(
    readonly chatClient: StreamChat,
    readonly channel: Channel
  ) {}

  dispose = async () => {
    this.chatClient.off('message.new', this.handleMessage);
    await this.chatClient.disconnectUser();

    // Ensure all active Gemini handlers are disposed
    this.handlers.forEach((handler) => handler.dispose());
    this.handlers = [];
  };

  get user() {
    return this.chatClient.user;
  }

  getLastInteraction = (): number => this.lastInteractionTs;

  init = async () => {
    const apiKey = process.env.GEMINI_API_KEY as string | undefined;
    if (!apiKey) {
      throw new Error('Gemini API key is required');
    }

    this.ai = new GoogleGenAI({ apiKey });

    // ⭐️ Key change: Create the stateful Chat session here
    this.chatSession = this.ai.chats.create({
      model: 'gemini-2.5-flash-lite', // A common model for chat and function calling
      // The configuration includes the system instruction and tools for the entire session
      config: {
        systemInstruction: this.getWritingAssistantPrompt(),
        tools: [
          {
            functionDeclarations: [
              webSearchFunctionDeclaration,
              imageAnalysisFunctionDeclaration,
              driveImageSearchFunctionDeclaration,
              csvSearchFunctionDeclaration,
              jsonSearchFunctionDeclaration,
              qaSearchFunctionDeclaration,
            ],
          },
        ],
        temperature: 0.7,
      },
    });

    this.chatClient.on('message.new', this.handleMessage);
  };

  /**
   * Generates the system instruction for the Gemini model.
   * Note: The instruction is now set once in `init` for the whole session.
   */
  private getWritingAssistantPrompt = (context?: string): string => {
    const currentDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Instructions have been adapted for Gemini's prompt style
    return `You are an expert AI Assistant for GDGOC IET DAVV (also known as GDSC IET DAVV). Your primary purpose is to provide helpful, accurate, and friendly information to students and community members based ONLY on the official GDGOC IET DAVV websites.

**Your Core Persona:**
- You are enthusiastic, knowledgeable, and passionate about technology and the GDGOC community.
- You should answer questions about events, workshops, community membership, tech domains (like Cloud, Web, App Dev), and past activities.

**Crucial Instructions:**
1.  **Your knowledge is strictly limited to the official websites, social handles, the official Drive image folder index, the CSV datasets, and the Hack2Skill event page: gdgoc-ietdavv.netlify.app, gdsc.ietdavv.edu.in, ietdavv.edu.in, instagram.com/gdgoc.ietdavv, linkedin.com/company/gdgoc-iet-davv, and vision.hack2skill.com/event/gdgoc-25-ietdavv.**
2.  **ALWAYS use the 'web_search' tool to answer questions**, especially about events, dates, news, or specific details about the club.
3.  **When you generate a query for the 'web_search' tool, you MUST scope your search to the official sources AND include the phrase "gdgoc iet davv" in every query.** Prepend your query with 'site:gdgoc-ietdavv.netlify.app', 'site:gdsc.ietdavv.edu.in', 'site:ietdavv.edu.in', 'site:instagram.com/gdgoc.ietdavv', 'site:linkedin.com/company/gdgoc-iet-davv', or 'site:vision.hack2skill.com/event/gdgoc-25-ietdavv'. For example, if the user asks 'what are the upcoming events?', your search query should be 'site:gdgoc-ietdavv.netlify.app "gdgoc iet davv" upcoming events'.
4.  **For Hackvento or hackathon-related questions, prioritize the Hack2Skill event page and include it in your search query** (e.g., 'site:vision.hack2skill.com/event/gdgoc-25-ietdavv "gdgoc iet davv" registration').
5.  **For image-related questions, use the 'drive_image_search' tool to retrieve relevant images and captions from the official Drive index.** If relevant images exist, you should mention them in your text response; the system will attach the images automatically.
6.  **Use the 'qa_search' tool FIRST for direct Q&A matches.** If no relevant answer is found, continue.
7.  **Then use the 'json_search' tool, followed by 'csv_search' for structured data.** If no relevant records are found, continue.
8.  **Only if local QA/JSON/CSV searches return no relevant information, use the 'web_search' tool** (still scoped to official sources).
9.  When you get back search results, **you MUST base your response ONLY on the information provided in those results.** Do not use your general knowledge.
10. If local data and web search provide no relevant information, you must state that you couldn't find the information on the official sources. DO NOT invent an answer.

**Response Format:**
- Be friendly, direct, and clear.
- Use formatting like lists or bold text to make information easy to read.
- Provide concise and helpful answers without unnecessary introductions.
- Keep answers short (aim for 4-6 lines unless the user explicitly asks for more detail).

**Context:** The user is interacting with you on the official GDGOC IET DAVV chatbot. Today's date is ${currentDate}. Assume queries are about this specific Google Developer Group chapter unless otherwise specified.`;
  };

  private handleMessage = async (e: Event<DefaultGenerics>) => {
    // ⭐️ Replaced openai, openAiThread, and assistant with ai and chatSession checks
    if (!this.ai || !this.chatSession) {
      console.log('Gemini Agent not initialized');
      return;
    }

    if (!e.message || e.message.ai_generated) {
      return;
    }

    const message = e.message.text;
    const imageAttachment = e.message.attachments?.find(
      (attachment) => attachment.type === 'image'
    );
    const imageUrl = imageAttachment?.image_url || imageAttachment?.asset_url;

    if (!message && !imageUrl) {
      return; // No text or image to process
    }

    this.lastInteractionTs = Date.now();

    // Context handling remains, although Gemini handles System Instructions globally.
    // If you need per-message instructions, you would need to use `generateContentStream`
    // and manually manage history, but we'll stick to the simpler Chat flow here.
    const writingTask = (e.message.custom as { writingTask?: string })
      ?.writingTask;
    // const context = writingTask ? `Writing Task: ${writingTask}` : undefined;
    // If you need to dynamically update the context, you would need to recreate the chatSession,
    // or include the context in the user message, which is usually simpler.

    // ❌ REMOVED: No need to explicitly create a message in a thread.
    // The Gemini `sendMessageStream` handles this implicitly.
    // await this.openai.beta.threads.messages.create(...)

    // 1. Create the placeholder message in Stream Chat
    const { message: channelMessage } = await this.channel.sendMessage({
      text: '',
      ai_generated: true,
      ...(imageUrl
        ? { attachments: [{ type: 'image', image_url: imageUrl }] }
        : {}),
    });

    // 2. Send the indicator
    await this.channel.sendEvent({
      type: 'ai_indicator.update',
      ai_state: 'AI_STATE_THINKING',
      cid: channelMessage.cid,
      message_id: channelMessage.id,
    });

    // 3. Create the handler and start the stream
    // ⭐️ Replaced openai, thread, and run with ai, chatSession, and the user message text
    const handler = new GEMINIResponseHandler(
      this.ai,
      this.chatSession,
      { text: message || '', imageUrl: imageUrl },
      this.chatClient,
      this.channel,
      channelMessage,
      () => this.removeHandler(handler)
    );
    this.handlers.push(handler);
    void handler.run();
  };

  private removeHandler = (handlerToRemove: GEMINIResponseHandler) => {
    this.handlers = this.handlers.filter(
      (handler) => handler !== handlerToRemove
    );
  };
}
