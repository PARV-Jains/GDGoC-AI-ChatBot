import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ArrowRight, Paperclip, Square, X } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { WritingPromptsToolbar } from "./writing-prompts-toolbar";
import {
  MessageList,
  useAIState,
  useChannelActionContext,
  useChannelStateContext,
  useChatContext,
  Window,
} from 'stream-chat-react';
import { Channel } from 'stream-chat';
import { VoiceAssistant } from './VoiceAssistant';

export interface ChatInputProps {
  className?: string;
  sendMessage: (message: { text: string; imageFile?: File }) => Promise<void> | void;
  isGenerating?: boolean;
  onStopGenerating?: () => void;
  placeholder?: string;
  value: string;
  onValueChange: (text: string) => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
  showPromptToolbar?: boolean;
  imageFile?: File | null;
  onImageChange: (file: File | null) => void;
  onNewChannelRequest?: () => Promise<Channel>;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  className,
  sendMessage,
  isGenerating = false,
  onStopGenerating,
  placeholder = "Ask me to write something, or paste text to improve...",
  value,
  onValueChange,
  textareaRef: externalTextareaRef,
  showPromptToolbar = false,
  imageFile,
  onImageChange,
    onNewChannelRequest
}) => {
  const [isLoading, setIsLoading] = useState(false);
   const { channel, messages } = useChannelStateContext();
     const { client } = useChatContext();
  const [error, setError] = useState<string | null>(null); // Added for error handling
  const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = externalTextareaRef || internalTextareaRef;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePromptSelect = (prompt: string) => {
    onValueChange(value ? `${value.trim()} ${prompt}` : prompt);
    textareaRef.current?.focus();
    console.log('Prompt selected:', prompt);
  };

  const updateTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const scrollHeight = textarea.scrollHeight;
      const maxHeight = 120;
      const textareaHeight = Math.min(scrollHeight, maxHeight);
      textarea.style.height = `${textareaHeight}px`;
    }
  }, [textareaRef]);

  useEffect(() => {
    updateTextareaHeight();
  }, [value, updateTextareaHeight]);

  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && !file.type.startsWith('image/')) {
      setError('Please select a valid image file.');
      onImageChange(null);
      return;
    }
    setError(null);
    onImageChange(file || null);
    if (event.target) {
      event.target.value = "";
    }
    console.log('Image selected:', file ? file.name : 'None');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('handleSubmit called with value:', value, 'imageFile:', imageFile);

    if ((!value.trim() && !imageFile) || isLoading || isGenerating) {
      console.log('Submission blocked: No text/image or loading/generating');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await sendMessage({ text: value.trim(), imageFile });
      onValueChange("");
      onImageChange(null);
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.focus(); // Re-focus textarea after submission
      }
      console.log('Message sent successfully');
    } catch (error) {
      console.error('Error sending message:', error);
      setError('Failed to send message. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      console.log('Enter key pressed');
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col bg-background",
        showPromptToolbar && "border-t border-border/50"
      )}
    >
      
      {showPromptToolbar && (
        <WritingPromptsToolbar onPromptSelect={handlePromptSelect} />
      )}
      
      <div className={cn("p-4", className)}>
        
        {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
        
        <form onSubmit={handleSubmit}>
            {/* { client.user?.id && (
                       <VoiceAssistant userId={client.user.id}  />
                     )} */}
          <div className="relative flex items-center">
            
            
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageSelect}
              accept="image/*"
              className="hidden"
            />
            <div className="absolute left-2 bottom-2 flex items-center gap-1 z-10">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-md flex-shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading || isGenerating}
                title="Attach image"
              >
                <Paperclip className="h-4 w-4" />
              </Button>

              {/* Conditionally render VoiceAssistant and pass required props */}
              {/* {client.user?.id && (
                <VoiceAssistant userId={client.user.id} channelId={channel?.id} onNewChannelRequest={onNewChannelRequest} />
              )} */}
            </div>

            <Textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className={cn(
                "min-h-[56px] max-h-[120px] resize-none py-3 pl-12 pr-20 text-sm",
                "border-input focus:border-primary/50 rounded-lg",
                "transition-colors duration-200 bg-background"
              )}
              disabled={isLoading || isGenerating}
            />

            {value.trim() && !isLoading && !isGenerating && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onValueChange("")}
                className="absolute right-12 bottom-2 h-8 w-8 rounded-md text-muted-foreground hover:text-foreground"
                title="Clear text"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
            

            {isGenerating ? (
              <Button
                type="button"
                onClick={onStopGenerating}
                className="absolute right-2 bottom-2 h-8 w-8 rounded-md flex-shrink-0 p-0"
                variant="destructive"
                title="Stop generating"
                disabled={isLoading}
              >
                <Square className="h-4 w-4" />
                
              </Button>
              
              
            ) : (
              <Button
                type="submit"
                disabled={(!value.trim() && !imageFile) || isLoading || isGenerating}
                className={cn(
                  "absolute right-2 bottom-2 h-8 w-8 rounded-md flex-shrink-0 p-0",
                  "transition-all duration-200",
                  "disabled:opacity-30 disabled:cursor-not-allowed"
                )}
                variant={value.trim() || imageFile ? "default" : "ghost"}
              >
                <ArrowRight className="h-4 w-4" />
                
              </Button>
              
            )}
          </div>
        </form>
      </div>
    </div>
  );
};