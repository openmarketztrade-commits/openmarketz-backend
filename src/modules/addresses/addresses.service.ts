import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service.js';
import { SaveAddressDto } from './dto/save-address.dto.js';

type GeoapifyAddress = {
  place_id?: string;
  formatted?: string;
  country?: string;
  country_code?: string;
  state?: string;
  city?: string;
  suburb?: string;
  district?: string;
  county?: string;
  lat?: number;
  lon?: number;
};

type GeoapifyFeatureCollection = {
  features?: { properties?: GeoapifyAddress }[];
};

@Injectable()
export class AddressesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  list(userId: string) {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async autocomplete(input: string) {
    const query = input?.trim();
    if (!query || query.length < 3 || query.length > 200) {
      throw new BadRequestException('Enter at least 3 characters to search.');
    }
    const key = this.config.get<string>('GEOAPIFY_API_KEY');
    if (!key)
      throw new ServiceUnavailableException(
        'Address search is not configured.',
      );

    const url = new URL('https://api.geoapify.com/v1/geocode/autocomplete');
    url.search = new URLSearchParams({
      text: query,
      filter: 'countrycode:ng',
      lang: 'en',
      limit: '8',
      format: 'geojson',
      apiKey: key,
    }).toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok)
      throw new BadGatewayException(
        'Address search is temporarily unavailable.',
      );
    const payload = (await response.json()) as GeoapifyFeatureCollection;
    return (payload.features ?? []).flatMap(({ properties }) =>
      properties?.place_id && properties.formatted
        ? [{ placeId: properties.place_id, description: properties.formatted }]
        : [],
    );
  }

  async save(userId: string, input: SaveAddressDto, addressId?: string) {
    if (addressId) {
      const existing = await this.prisma.address.findFirst({
        where: { id: addressId, userId },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('Address not found.');
    }
    let addressDetails: {
      line1: string;
      city: string;
      state: string;
      providerPlaceId: string | null;
      area: string;
      latitude: number | null;
      longitude: number | null;
    };
    const selectedPlaceId = input.placeId ?? input.googlePlaceId;
    if (selectedPlaceId) {
      const place = await this.getPlace(selectedPlaceId);
      if (place.country_code?.toLowerCase() !== 'ng') {
        throw new BadRequestException('Delivery addresses must be in Nigeria.');
      }
      const state = place.state;
      const city =
        place.city ?? place.suburb ?? place.district ?? place.county;
      if (!place.formatted || !state || !city) {
        throw new BadRequestException(
          'Choose a complete street address in Nigeria.',
        );
      }
      addressDetails = {
        line1: place.formatted,
        city,
        state,
        providerPlaceId: place.place_id ?? selectedPlaceId,
        area: city,
        latitude: place.lat ?? null,
        longitude: place.lon ?? null,
      };
    } else {
      const line1 = input.line1?.trim();
      const city = input.city?.trim();
      const state = input.state?.trim();
      if (!line1 || !city || !state) {
        throw new BadRequestException(
          'Enter a street address, city, and state.',
        );
      }
      addressDetails = {
        line1,
        city,
        state,
        providerPlaceId: null,
        area: city,
        latitude: null,
        longitude: null,
      };
    }

    return this.prisma.$transaction(async (tx) => {
      if (input.isDefault || !addressId) {
        await tx.address.updateMany({
          where: { userId },
          data: { isDefault: false },
        });
      }
      const data = {
        fullName: input.fullName.trim(),
        phone: input.phone.trim(),
        line1: addressDetails.line1,
        city: addressDetails.city,
        state: addressDetails.state,
        country: 'NG',
        landmark: input.landmark?.trim() || null,
        label: input.label,
        // Keep writing the existing column until all deployed clients and data
        // have moved to a provider-neutral schema. Geoapify IDs are opaque IDs.
        googlePlaceId: addressDetails.providerPlaceId,
        area: addressDetails.area,
        latitude: addressDetails.latitude,
        longitude: addressDetails.longitude,
        isDefault: input.isDefault ?? !addressId,
      };
      return addressId
        ? tx.address.update({ where: { id: addressId }, data })
        : tx.address.create({ data: { userId, ...data } });
    });
  }

  async setDefault(userId: string, addressId: string) {
    const address = await this.prisma.address.findFirst({
      where: { id: addressId, userId },
      select: { id: true },
    });
    if (!address) throw new NotFoundException('Address not found.');
    await this.prisma.$transaction([
      this.prisma.address.updateMany({
        where: { userId },
        data: { isDefault: false },
      }),
      this.prisma.address.update({
        where: { id: addressId },
        data: { isDefault: true },
      }),
    ]);
    return this.prisma.address.findUniqueOrThrow({ where: { id: addressId } });
  }

  async remove(userId: string, addressId: string) {
    const deleted = await this.prisma.address.deleteMany({
      where: { id: addressId, userId },
    });
    if (deleted.count !== 1) throw new NotFoundException('Address not found.');
    return { success: true };
  }

  private async getPlace(placeId: string): Promise<GeoapifyAddress> {
    const key = this.config.get<string>('GEOAPIFY_API_KEY');
    if (!key)
      throw new ServiceUnavailableException(
        'Address search is not configured.',
      );
    if (!/^[A-Za-z0-9_-]{5,300}$/.test(placeId)) {
      throw new BadRequestException(
        'Choose an address from the search results.',
      );
    }
    const url = new URL('https://api.geoapify.com/v2/place-details');
    url.search = new URLSearchParams({ id: placeId, apiKey: key }).toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (response.status === 404 || response.status === 400)
      throw new BadRequestException('Choose a valid address.');
    if (!response.ok)
      throw new BadGatewayException(
        'Address details are temporarily unavailable.',
      );
    const payload = (await response.json()) as GeoapifyFeatureCollection;
    const place = payload.features?.find(
      (feature) => feature.properties?.place_id,
    )?.properties;
    if (!place) throw new BadRequestException('Choose a valid address.');
    return place;
  }
}
