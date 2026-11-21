import { IsEmail, IsEnum, IsIn } from 'class-validator';
import { UserRole } from '@prisma/client';

export class UpdateAdminUserStatusDto {
  @IsEnum({ ACTIVE: 'ACTIVE', SUSPENDED: 'SUSPENDED' })
  status!: 'ACTIVE' | 'SUSPENDED';
}

export class UpdateAdminUserRoleDto {
  @IsEnum(UserRole)
  role!: UserRole;
}

export class UpdateAdminProductStatusDto {
  @IsIn(['ACTIVE', 'PAUSED', 'ARCHIVED'])
  status!: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
}

export class GrantAdminDto {
  @IsEmail()
  email!: string;
}
