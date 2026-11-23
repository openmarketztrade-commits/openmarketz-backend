import { IsOptional, IsUrl } from 'class-validator';

export class UpdateCategoryDto {
  @IsOptional()
  @IsUrl({ require_protocol: true })
  imageUrl?: string | null;
}
