import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/permissions.decorator';
import { ReqMeta, type RequestMeta } from '../auth/decorators/request-meta.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AssignRoleDto } from './dto/assign-role.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SetUserStatusDto } from './dto/set-user-status.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermission('users', 'view')
  findAll() {
    return this.usersService.findAll();
  }

  @Get('by-email/:email')
  @RequirePermission('users', 'view')
  findByEmail(@Param('email') email: string) {
    return this.usersService.findByEmail(email);
  }

  @Get(':id')
  @RequirePermission('users', 'view')
  findById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.usersService.findById(id);
  }

  @Post()
  @RequirePermission('users', 'create')
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthenticatedUser, @ReqMeta() meta: RequestMeta) {
    return this.usersService.create(dto, actor, meta);
  }

  @Patch(':id')
  @RequirePermission('users', 'edit')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.usersService.update(id, dto, actor, meta);
  }

  @Patch(':id/status')
  @RequirePermission('users', 'edit')
  setStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SetUserStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.usersService.setStatus(id, dto.status, actor, meta);
  }

  @Patch(':id/role')
  @RequirePermission('users', 'edit')
  assignRole(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AssignRoleDto,
    @CurrentUser() actor: AuthenticatedUser,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.usersService.assignRole(id, dto.roleId, actor, meta);
  }

  /** Restablece la contraseña de otro usuario, desbloquea intentos y cierra sus sesiones. */
  @Post(':id/reset-password')
  @RequirePermission('users', 'edit')
  @HttpCode(HttpStatus.NO_CONTENT)
  resetPassword(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() actor: AuthenticatedUser,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.usersService.resetPassword(id, dto.newPassword, actor, meta);
  }
}
