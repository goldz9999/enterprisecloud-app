import { Controller, Get } from '@nestjs/common';
import { RequirePermission } from '../auth/decorators/permissions.decorator';
import { PermissionsService } from './permissions.service';

@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @RequirePermission('permissions', 'view')
  findAll() {
    return this.permissionsService.findAll();
  }

  @Get('catalog')
  @RequirePermission('permissions', 'view')
  catalog() {
    return this.permissionsService.catalog();
  }
}
