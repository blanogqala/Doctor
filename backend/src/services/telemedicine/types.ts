export type TelemedicineParticipantRole = 'doctor' | 'patient';

export interface ParticipantTokenInput {
  roomName: string;
  identity: string;
  displayName: string;
  role: TelemedicineParticipantRole;
  ttlSeconds: number;
}

export interface TelemedicineProvider {
  isConfigured(): boolean;
  getPublicUrl(): string | null;
  createRoom(roomName: string, metadata?: Record<string, string>): Promise<void>;
  createParticipantToken(input: ParticipantTokenInput): Promise<string>;
  endRoom(roomName: string): Promise<void>;
}
