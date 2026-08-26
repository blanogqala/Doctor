import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { env, isLiveKitConfigured } from '../../config/env';
import type { ParticipantTokenInput, TelemedicineProvider } from './types';

export class LiveKitTelemedicineProvider implements TelemedicineProvider {
  private roomClient: RoomServiceClient | null = null;

  isConfigured(): boolean {
    return isLiveKitConfigured();
  }

  getPublicUrl(): string | null {
    return env.LIVEKIT_URL ?? null;
  }

  private getRoomClient(): RoomServiceClient {
    if (!this.roomClient) {
      if (!isLiveKitConfigured()) {
        throw new Error('LiveKit is not configured');
      }
      this.roomClient = new RoomServiceClient(
        env.LIVEKIT_URL!,
        env.LIVEKIT_API_KEY!,
        env.LIVEKIT_API_SECRET!
      );
    }
    return this.roomClient;
  }

  async createRoom(roomName: string, metadata?: Record<string, string>): Promise<void> {
    const client = this.getRoomClient();
    try {
      await client.createRoom({
        name: roomName,
        emptyTimeout: 60 * 15,
        maxParticipants: 2,
        metadata: metadata ? JSON.stringify(metadata) : undefined,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.toLowerCase().includes('already exists')) {
        return;
      }
      throw err;
    }
  }

  async createParticipantToken(input: ParticipantTokenInput): Promise<string> {
    if (!isLiveKitConfigured()) {
      throw new Error('LiveKit is not configured');
    }

    const canPublish = true;
    const canSubscribe = true;

    const token = new AccessToken(env.LIVEKIT_API_KEY!, env.LIVEKIT_API_SECRET!, {
      identity: input.identity,
      name: input.displayName,
      ttl: input.ttlSeconds,
    });

    token.addGrant({
      roomJoin: true,
      room: input.roomName,
      canPublish,
      canSubscribe,
      canPublishData: false,
      canUpdateOwnMetadata: false,
      hidden: false,
      recorder: false,
    });

    return await token.toJwt();
  }

  async endRoom(roomName: string): Promise<void> {
    const client = this.getRoomClient();
    try {
      await client.deleteRoom(roomName);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.toLowerCase().includes('not found')) {
        return;
      }
      throw err;
    }
  }
}

export const liveKitProvider = new LiveKitTelemedicineProvider();
