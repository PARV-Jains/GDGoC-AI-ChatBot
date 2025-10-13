// src/components/VoiceAssistant.tsx

import { useState } from 'react';
import { LiveKitRoom, AudioConference } from '@livekit/components-react';
import { Mic } from 'lucide-react';
import { Button } from './ui/button';
import { Channel } from 'stream-chat'; // Import Channel type if not already

interface VoiceAssistantProps {
  userId: string;
  channelId?: string; // Optional because it might not exist on "New Session" screen
  onNewChannelRequest?: () => Promise<Channel>; // Function to create a new channel if needed
}

export const VoiceAssistant = ({ userId, channelId, onNewChannelRequest }: VoiceAssistantProps) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [roomName, setRoomName] = useState<string | null>(null);

  const handleToggleVoice = async () => {
    if (isConnected) {
      // Disconnect logic: The LiveKitRoom component will handle disconnection
      // when 'connect' prop becomes false or the component unmounts.
      setIsConnected(false);
      setToken(null);
      setRoomName(null);
      return;
    }

    setIsConnecting(true);
    try {
      let currentChannelId = channelId;

      // If no channelId exists (i.e., on the "New Writing Session" screen),
      // call the function to create a new Stream Chat channel first.
      if (!currentChannelId && onNewChannelRequest) {
        console.log("Creating new Stream Chat channel for voice session...");
        const newChannel = await onNewChannelRequest();
        currentChannelId = newChannel.id; // Use the ID of the newly created channel
        console.log(`New Stream Chat channel created: ${currentChannelId}`);
      }

      // If after trying to create, we still don't have a channel ID, throw an error.
      if (!currentChannelId) {
        throw new Error("Could not establish a channel for voice chat. Please try again.");
      }

      // Construct a unique room name for LiveKit
      const livekitRoomName = `voice-chat-${currentChannelId}`;

      // Request a LiveKit token from your backend
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/livekit-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: userId, roomName: livekitRoomName }),
      });

      if (!response.ok) {
        throw new Error(`Failed to get LiveKit token: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      setToken(data.token);
      setRoomName(livekitRoomName); // Store the LiveKit room name
      setIsConnected(true); // Indicate successful connection attempt

    } catch (error) {
      console.error("Error connecting to voice chat:", error);
      // Optionally display an error to the user
    } finally {
      setIsConnecting(false);
    }
  };

  // If not connected, show the connect button
  if (!isConnected) {
    return (
      <Button onClick={handleToggleVoice} size="icon" disabled={isConnecting} title="Start voice chat">
        <Mic className="h-4 w-4" />
      </Button>
    );
  }

  // If connected, render the LiveKitRoom
  return (
    <LiveKitRoom
      serverUrl={import.meta.env.VITE_LIVEKIT_URL} // Your LiveKit server URL
      token={token} // The token received from your backend
      connect={true} // Connect to the room when this component renders
      audio={true} // Enable audio
      video={false} // Disable video
      // Callback for when the LiveKit room disconnects
      onDisconnected={() => {
        console.log("LiveKit room disconnected.");
        setIsConnected(false);
        setToken(null);
        setRoomName(null);
      }}
      // You can add custom UI for media devices, connection status, etc., inside LiveKitRoom
    >
      <AudioConference /> {/* Provides basic audio UI */}
      <Button onClick={handleToggleVoice} size="icon" variant="destructive" title="Stop voice chat">
         <Mic className="h-4 w-4" /> {/* Mic icon turns red when active */}
      </Button>
      {/* Other LiveKit components can go here, e.g., <ConnectionState /> */}
    </LiveKitRoom>
  );
};