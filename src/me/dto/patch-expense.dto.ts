import { IsBoolean } from 'class-validator';

export class PatchExpenseDto {
  @IsBoolean()
  isPaid!: boolean;
}
