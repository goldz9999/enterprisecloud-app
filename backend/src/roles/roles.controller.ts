import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { PermissionsService } from '../permissions/permissions.service';
import { RolesService } from './roles.service';

@Controller('roles')
export class RolesController {
  constructor(
    private readonly rolesService: RolesService,
    private readonly permissionsService: PermissionsService,
  ) {}

  @Get()
  findAll() {
    return this.rolesService.findAll();
  }

  @Get(':id/permissions')
  findPermissions(@Param('id', new ParseUUIDPipe()) roleId: string) {
    return this.permissionsService.findForRole(roleId);
  }

  @Get(':id')
  findById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.rolesService.findById(id);
  }
}
