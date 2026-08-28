import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class ChatMessageDto {
  @IsOptional()
  @IsUUID('4')
  sessionId?: string;

  /** Perfil activo en la UI (inventario o gastos); el backend valida acceso en BD. */
  @IsOptional()
  @IsUUID('4')
  profileId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message!: string;
}

export class ChatConfigQueryDto {
  @IsOptional()
  @IsUUID('4')
  profileId?: string;
}

export interface ChatProfileContextBlock {
  readonly mode: 'single' | 'overview';
  readonly activeProfileName?: string;
  readonly activeProfileType?: 'familiar' | 'grupal' | 'comercio';
  readonly access?: 'owner' | 'collaborator';
  readonly inventoryEnabled?: boolean;
  readonly branchCount?: number;
  readonly currency?: 'BS' | 'USD';
  readonly otherProfilesSummary?: readonly string[];
}

export interface ChatMessageResponseDto {
  sessionId: string;
  reply: string;
  blocked: boolean;
  ollamaAvailable: boolean;
}

export interface ChatConfigResponseDto {
  brandName: string;
  disclaimer: string;
  suggestions: readonly string[];
  profileContext?: ChatProfileContextBlock;
}

export interface ChatHealthResponseDto {
  ollama: 'ok' | 'unavailable';
  chatEnabled: boolean;
}
