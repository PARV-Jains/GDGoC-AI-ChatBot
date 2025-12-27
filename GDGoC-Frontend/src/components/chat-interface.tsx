import { useAIAgentStatus } from '@/hooks/use-ai-agent-status';
import {
  Bot,
  Briefcase,
  FileText,
  Lightbulb,
  Menu,
  MessageSquare,
  Sparkles,
  X,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { Channel as ChannelType } from 'stream-chat';
import {
  Channel,
  MessageList,
  useAIState,
  useChannelActionContext,
  useChannelStateContext,
  useChatContext,
  Window,
} from 'stream-chat-react';
import { AIAgentControl } from './ai-agent-control';
import { ChatInput } from './chat-input';
import ChatMessage from './chat-message';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { VoiceAssistant } from './VoiceAssistant';

interface ChatInterfaceProps {
  onToggleSidebar: () => void;
  onNewChatMessage: (message: { text: string; file?: File }) => Promise<void>;
  onNewChannelRequest: () => Promise<ChannelType>; 
  backendUrl: string;
}

interface EmptyStateWithInputProps {
  onNewChatMessage: ChatInterfaceProps['onNewChatMessage'];
  onNewChannelRequest: ChatInterfaceProps['onNewChannelRequest'];
}

const EmptyStateWithInput: React.FC<EmptyStateWithInputProps> = ({ onNewChatMessage, onNewChannelRequest }) => {
  const [inputText, setInputText] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const writingCategories = [
    { id: 'events', icon: <Briefcase className="h-4 w-4" />, title: 'Events', prompts: ['Tell me about upcoming events.', 'What workshops have you hosted recently?'] },
    { id: 'about', icon: <FileText className="h-4 w-4" />, title: 'About', prompts: ['What is GDGOC IET DAVV?', 'Who are the organizers?'] },
    { id: 'community', icon: <MessageSquare className="h-4 w-4" />, title: 'Community', prompts: ['How can I join the community?', 'Are there any volunteer opportunities?'] },
    { id: 'tech', icon: <Lightbulb className="h-4 w-4" />, title: 'Tech', prompts: ['What tech domains do you focus on?', 'Do you have resources for learning Cloud?'] },
  ];

  const handlePromptClick = (prompt: string) => {
    setInputText(prompt);
  };

  const handleSendMessage = (message: { text: string; imageFile?: File }) => {
    onNewChatMessage({ text: message.text, file: message.imageFile });
    setInputText('');
    setImageFile(null);
    setImagePreview(null);
    setError(null);
  };

  const handleRemovePreview = () => {
    setImageFile(null);
    setImagePreview(null);
    setError(null);
  };

  const handleImageChange = (file: File | null) => {
    setImageFile(file);
    setError(null);

    if (file) {
      if (!file.type.startsWith('image/')) {
        setError('Please select a valid image file.');
        setImagePreview(null);
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        if (reader.result) {
          setImagePreview(reader.result as string);
        } else {
          setError('Failed to generate image preview.');
        }
      };
      reader.onerror = () => {
        setError('Failed to read the image file.');
        setImagePreview(null);
      };
      reader.readAsDataURL(file);
    } else {
      setImagePreview(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-transparent">
      <div className="flex-1 flex items-center justify-center overflow-y-auto p-6">
        <div className="text-center max-w-3xl w-full">
          <div className="mb-6">
            <div className="relative inline-flex items-center justify-center w-16 h-16 mb-4">
              <div className="absolute inset-0 bg-primary/20 rounded-2xl animate-pulse"></div>
              <Bot className="h-8 w-8 text-primary relative z-10" />
              <Sparkles className="h-4 w-4 text-primary/60 absolute -top-1 -right-1" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">GDGOC IET DAVV Chatbot</h1>
            <p className="text-sm text-muted-foreground mb-4">Your guide to events, community, and tech at GDGOC.</p>
          </div>
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">What would you like to know?</h2>
            <Tabs defaultValue="events" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                {writingCategories.map((category) => (
                  <TabsTrigger key={category.id} value={category.id} className="flex items-center gap-1.5 text-xs">
                    {category.icon}
                    <span className="hidden sm:inline">{category.title}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
              {writingCategories.map((category) => (
                <TabsContent key={category.id} value={category.id} className="mt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {category.prompts.map((prompt, promptIndex) => (
                      <button key={promptIndex} onClick={() => handlePromptClick(prompt)} className="p-3 text-left text-sm rounded-lg bg-muted/30 hover:bg-muted/50 transition-all duration-200 border border-muted/50 hover:border-muted group">
                        <span className="text-foreground group-hover:text-primary transition-colors">{prompt}</span>
                      </button>
                    ))}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </div>
      </div>

      <div className="border-t bg-background/95 backdrop-blur-sm gdg-input-shell">
        <div className="p-4">
          {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
          {imagePreview && (
            <div className="relative w-24 h-24 mb-2">
              <img src={imagePreview} alt="Preview" className="w-full h-full object-cover rounded-md" />
              <button onClick={handleRemovePreview} className="absolute top-0 right-0 bg-gray-800 text-white rounded-full p-1">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <ChatInput
            sendMessage={handleSendMessage}
            onNewChannelRequest={onNewChannelRequest}
            value={inputText}
            onValueChange={setInputText}
            imageFile={imageFile}
            onImageChange={handleImageChange}
            placeholder="Ask about events, community, or anything GDGOC..."
          />
          <div className="flex items-center justify-center gap-4 mt-3 text-xs text-muted-foreground">
            <span>Press Enter to send</span>
            <span>•</span>
            <span>Shift + Enter for new line</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const MessageListEmptyIndicator = () => (
  <div className="h-full flex items-center justify-center">
    <div className="text-center px-4">
      <div className="relative inline-flex items-center justify-center w-12 h-12 mb-4">
        <div className="absolute inset-0 bg-primary/10 rounded-xl"></div>
        <Bot className="h-6 w-6 text-primary/80 relative z-10" />
      </div>
      <h2 className="text-lg font-medium text-foreground">Ready to Help</h2>
      <p className="text-sm text-muted-foreground">Ask me anything about GDGOC IET DAVV.</p>
    </div>
  </div>
);

const MessageListContent = () => {
  const { messages, thread } = useChannelStateContext();
  const isThread = !!thread;
  if (isThread) return null;
  return (
    <div className="flex-1 min-h-0">
      {!messages?.length ? <MessageListEmptyIndicator /> : <MessageList Message={ChatMessage} />}
    </div>
  );
};

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ onToggleSidebar, onNewChannelRequest, onNewChatMessage, backendUrl }) => {
  const { channel, client } = useChatContext();
  const agentStatus = useAIAgentStatus({ channelId: channel?.id ?? null, backendUrl });

  if (!onNewChannelRequest) {
    console.error("CRITICAL: ChatInterface did not receive the 'onNewChannelRequest' prop. The microphone will not work for new sessions.");
  }

  const ChannelMessageInputComponent = () => {
    const { sendMessage } = useChannelActionContext();
    const { channel, messages } = useChannelStateContext();
    const { aiState } = useAIState(channel);
    const [inputText, setInputText] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const isGenerating = aiState === 'AI_STATE_THINKING' || aiState === 'AI_STATE_GENERATING' || aiState === 'AI_STATE_EXTERNAL_SOURCES';

    const handleSendMessage = async (message: { text: string; imageFile?: File }) => {
      if (!channel) return;
      const attachments = [];
      if (message.imageFile) {
        const response = await channel.sendImage(message.imageFile);
        attachments.push({ type: 'image', asset_url: response.file, thumb_url: response.file });
      }
      sendMessage({ text: message.text, attachments: attachments });
      setInputText('');
      setImageFile(null);
      setImagePreview(null);
    };

    const handleStopGenerating = () => {
      if (channel) {
        const aiMessage = [...messages].reverse().find((m) => m.user?.id.startsWith('ai-bot'));
        if (aiMessage) {
          channel.sendEvent({ type: 'ai_indicator.stop', cid: channel.cid, message_id: aiMessage.id });
        }
      }
    };
    
    const handleRemovePreview = () => {
      setImageFile(null);
      setImagePreview(null);
    }

    return (
      <div className="p-4 border-t bg-background/95 backdrop-blur-sm gdg-input-shell">
        {imagePreview && (
          <div className="relative w-24 h-24 mb-2">
            <img src={imagePreview} alt="Preview" className="w-full h-full object-cover rounded-md" />
            <button onClick={handleRemovePreview} className="absolute top-0 right-0 bg-gray-800 text-white rounded-full p-1"><X className="h-4 w-4" /></button>
          </div>
        )}
        <ChatInput
          sendMessage={handleSendMessage}
          value={inputText}
          onValueChange={setInputText}
          textareaRef={textareaRef}
          showPromptToolbar={true}
          isGenerating={isGenerating}
          onStopGenerating={handleStopGenerating}
          imageFile={imageFile}
          onImageChange={(file) => {
            setImageFile(file);
            if (file) {
              const reader = new FileReader();
              reader.onloadend = () => {
                setImagePreview(reader.result as string);
              };
              reader.readAsDataURL(file);
            } else {
              setImagePreview(null);
            }
          }}
          onNewChannelRequest={onNewChannelRequest}
        />
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-background gdg-chat-bg">
      <header className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b bg-background/95 backdrop-blur-sm z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onToggleSidebar} className="lg:hidden h-9 w-9">
            <Menu className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary/80 rounded-lg flex items-center justify-center">
                <Bot className="h-4 w-4 text-primary-foreground" />
              </div>
              {channel?.id && agentStatus.status === 'connected' && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-background"></div>
              )}
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">{channel?.data?.name || 'New GDGOC Session'}</h2>
              <p className="text-xs text-muted-foreground">GDGOC IET DAVV Assistant</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* {client.user?.id && (
            <VoiceAssistant
              userId={client.user.id}
              channelId={channel?.id}
              onNewChannelRequest={onNewChannelRequest}
            />
          )} */}
          {channel?.id && <AIAgentControl status={agentStatus.status} loading={agentStatus.loading} error={agentStatus.error} toggleAgent={agentStatus.toggleAgent} checkStatus={agentStatus.checkStatus} channelId={channel.id} />}
        </div>
      </header>

      <div className="flex-1 flex flex-col min-h-0">
        {!channel ? (
          <EmptyStateWithInput onNewChatMessage={onNewChatMessage} onNewChannelRequest={onNewChannelRequest} />
        ) : (
          <Channel channel={channel}>
            <Window>
              <MessageListContent />
              <ChannelMessageInputComponent />
            </Window>
          </Channel>
        )}
      </div>
    </div>
  );
};

