import { IsNumber, Max, Min } from 'class-validator';

export class ShippingRatesDto {
  @IsNumber() @Min(0.1) @Max(1000) packageWeightKg!: number;
  @IsNumber() @Min(1) @Max(1000) lengthCm!: number;
  @IsNumber() @Min(1) @Max(1000) widthCm!: number;
  @IsNumber() @Min(1) @Max(1000) heightCm!: number;
}
