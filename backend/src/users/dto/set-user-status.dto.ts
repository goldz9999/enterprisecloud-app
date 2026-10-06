import { UserStatus } from '@prisma/client';
import { IsIn } from 'class-validator';

export class SetUserStatusDto {
  @IsIn([UserStatus.ACTIVE, UserStatus.INACTIVE])
  status!: UserStatus;
}
