import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/authenticated-user.js';
import { Roles } from '../../common/roles.decorator.js';
import { ReviewSellerApplicationDto } from './dto/review-seller-application.dto.js';
import { AdminService } from './admin.service.js';
import { GrantAdminDto, UpdateAdminProductStatusDto, UpdateAdminUserRoleDto, UpdateAdminUserStatusDto } from './dto/admin-moderation.dto.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryStatusDto } from './dto/update-category-status.dto.js';

@ApiTags('Admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('categories')
  @ApiOperation({ summary: 'List product categories, including inactive categories' })
  listCategories() {
    return this.admin.listCategories();
  }

  @Post('categories')
  @ApiOperation({ summary: 'Create a product category' })
  createCategory(@CurrentUser() actor: AuthenticatedUser, @Body() body: CreateCategoryDto) {
    return this.admin.createCategory(body, actor.id);
  }

  @Patch('categories/:id/status')
  @ApiOperation({ summary: 'Activate or deactivate a product category' })
  updateCategoryStatus(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() body: UpdateCategoryStatusDto,
  ) {
    return this.admin.updateCategoryStatus(id, body.active, actor.id);
  }

  @Post('users/admins')
  grantAdmin(@CurrentUser() actor: AuthenticatedUser, @Body() body: GrantAdminDto) {
    return this.admin.grantAdminByEmail(body.email, actor.id);
  }

  @Get('users')
  listUsers(@Query('q') q?: string, @Query('status') status?: string, @Query('role') role?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.admin.listUsers({ q, status, role, page, pageSize });
  }

  @Delete('users/:id/admin-access')
  revokeAdminAccess(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.admin.revokeAdminAccess(id, actor.id);
  }

  @Get('users/:id')
  getUser(@Param('id') id: string) {
    return this.admin.getUser(id);
  }

  @Patch('users/:id/status')
  updateUserStatus(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser, @Body() body: UpdateAdminUserStatusDto) {
    return this.admin.updateUserStatus(id, actor.id, body.status);
  }

  @Patch('users/:id/role')
  updateUserRole(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser, @Body() body: UpdateAdminUserRoleDto) {
    return this.admin.updateUserRole(id, actor.id, body.role);
  }

  @Delete('users/:id')
  deleteUser(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.admin.deleteUser(id, actor.id);
  }

  @Get('users/:id/sessions')
  listUserSessions(@Param('id') id: string) {
    return this.admin.listUserSessions(id);
  }

  @Delete('users/:userId/sessions/:sessionId')
  revokeUserSession(@Param('userId') userId: string, @Param('sessionId') sessionId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.admin.revokeUserSession(userId, sessionId, actor.id);
  }

  @Get('audit-events')
  listAuditEvents(@Query('targetId') targetId?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.admin.listAuditEvents({ targetId, page, pageSize });
  }

  @Get('products')
  listProducts(@Query('q') q?: string, @Query('status') status?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.admin.listProducts({ q, status, page, pageSize });
  }

  @Get('products/:id')
  getProduct(@Param('id') id: string) {
    return this.admin.getProduct(id);
  }

  @Patch('products/:id/status')
  updateProductStatus(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser, @Body() body: UpdateAdminProductStatusDto) {
    return this.admin.updateProductStatus(id, actor.id, body.status);
  }

  @Delete('products/:id')
  archiveProduct(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.admin.archiveProduct(id, actor.id);
  }

  @Get('seller-applications')
  listSellerApplications() {
    return this.admin.listSellerApplications();
  }

  @Patch('seller-applications/:id')
  reviewSellerApplication(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: ReviewSellerApplicationDto,
  ) {
    return this.admin.reviewSellerApplication(id, user.id, body);
  }

  @Get('seller-applications/:applicationId/media/:mediaId/access')
  getPrivateApplicationMediaUrl(
    @Param('applicationId') applicationId: string,
    @Param('mediaId') mediaId: string,
  ) {
    return this.admin.getPrivateApplicationMediaUrl(applicationId, mediaId);
  }
}
