import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type ShipbubbleEnvelope<T> = {
  status?: string;
  message?: string;
  errors?: string[];
  data?: T;
};

@Injectable()
export class ShipbubbleService {
  private readonly baseUrl = 'https://api.shipbubble.com/v1';

  constructor(private readonly config: ConfigService) {}

  async request<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    const apiKey = this.config.get<string>('SHIPBUBBLE_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Shipbubble delivery is not configured. Set SHIPBUBBLE_API_KEY on the backend.',
      );
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: body ? 'POST' : 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new ServiceUnavailableException(
        'Shipbubble could not be reached. Try again shortly.',
      );
    }

    const payload = (await response
      .json()
      .catch(() => null)) as ShipbubbleEnvelope<T> | null;
    if (!response.ok || payload?.status === 'failed' || !payload?.data) {
      const details = payload?.errors?.join(' ') || payload?.message;
      throw new ServiceUnavailableException(
        details || `Shipbubble request failed (HTTP ${response.status}).`,
      );
    }
    return payload.data;
  }
}
