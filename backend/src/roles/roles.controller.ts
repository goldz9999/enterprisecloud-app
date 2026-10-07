import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { RequirePermission } from '../auth/decorators/permissions.decorator';
import { PermissionsService } from '../permissions/permissions.service';
import { RolesService } from './roles.service';

@Controller('roles')
export class RolesController {
  constructor(
    private readonly rolesService: RolesService,
    private readonly permissionsService: PermissionsService,
  ) {}

  @Get()
  @RequirePermission('roles', 'view')
  findAll() {
    return this.rolesService.findAll();
  }

  @Get(':id/permissions')
  @RequirePermission('permissions', 'view')
  findPermissions(@Param('id', new ParseUUIDPipe()) roleId: string) {
    return this.permissionsService.findForRole(roleId);
  }

  @Get(':id')
  @RequirePermission('roles', 'view')
  findById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.rolesService.findById(id);
  }
}
