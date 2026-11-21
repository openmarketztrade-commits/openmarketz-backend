import { IsString, Length } from 'class-validator';

export class BookShippingDto {
  @IsString() @Length(1, 200) requestToken!: string;
  @IsString() @Length(1, 100) courierId!: string;
  @IsString() @Length(1, 100) serviceCode!: string;
}
