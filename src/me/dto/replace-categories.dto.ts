import { ArrayNotEmpty, IsArray, IsString, MaxLength } from 'class-validator';

export class ReplaceCategoriesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  names!: string[];
}
