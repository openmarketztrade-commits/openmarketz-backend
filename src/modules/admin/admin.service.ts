import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProductStatus, SellerApplicationStatus, UserRole, UserStatus } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';
import { PrismaService } from '../../database/prisma.service.js';
import { ReviewSellerApplicationDto } from './dto/review-seller-application.dto.js';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private pagination(pageInput?: string, sizeInput?: string) {
    const page = Math.max(1, Number.parseInt(pageInput ?? '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(sizeInput ?? '25', 10) || 25));
    return { page, pageSize, skip: (page - 1) * pageSize };
  }

  async listUsers(input: { q?: string; status?: string; role?: string; page?: string; pageSize?: string }) {
    const { page, pageSize, skip } = this.pagination(input.page, input.pageSize);
    const q = input.q?.trim();
    const where = {
      ...(input.status && Object.values(UserStatus).includes(input.status as UserStatus) ? { status: input.status as UserStatus } : {}),
      ...(input.role && Object.values(UserRole).includes(input.role as UserRole) ? { role: input.role as UserRole } : {}),
      ...(q ? { OR: [{ email: { contains: q, mode: 'insensitive' as const } }, { firstName: { contains: q, mode: 'insensitive' as const } }, { lastName: { contains: q, mode: 'insensitive' as const } }, { store: { is: { name: { contains: q, mode: 'insensitive' as const } } } }] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, skip, take: pageSize, orderBy: { createdAt: 'desc' }, select: { id: true, email: true, firstName: true, lastName: true, role: true, status: true, emailVerifiedAt: true, createdAt: true, store: { select: { id: true, name: true, active: true } }, sellerApplication: { select: { status: true } } } }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async grantAdminByEmail(emailInput: string, actorId: string) {
    const email = emailInput.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true, email: true, role: true, status: true, emailVerifiedAt: true } });
    if (!user) throw new NotFoundException('No account exists for that email. The person must sign up and verify their email before admin access can be granted.');
    if (user.status !== UserStatus.ACTIVE || !user.emailVerifiedAt) throw new ConflictException('Only active, email-verified accounts can be made administrators.');
    if (user.role === UserRole.ADMIN) throw new ConflictException('This account is already an administrator.');
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.user.update({ where: { id: user.id }, data: { role: UserRole.ADMIN }, select: { id: true, email: true, role: true, status: true } });
      await tx.authSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.auditEvent.create({ data: { actorId, action: 'admin_access_granted', targetType: 'user', targetId: user.id, metadata: { previousRole: user.role } } });
      return account;
    });
  }

  async revokeAdminAccess(id: string, actorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true, role: true, status: true, store: { select: { id: true } } } });
    if (!user) throw new NotFoundException('User not found.');
    if (user.role !== UserRole.ADMIN) throw new ConflictException('This account does not have administrator access.');
    if (id === actorId) throw new ConflictException('You cannot remove your own administrator access.');
    if (user.status === UserStatus.ACTIVE) await this.ensureAnotherAdmin(id);
    const grant = await this.prisma.auditEvent.findFirst({ where: { targetType: 'user', targetId: id, action: 'admin_access_granted' }, orderBy: { createdAt: 'desc' }, select: { metadata: true } });
    const previousRole = (grant?.metadata as { previousRole?: string } | undefined)?.previousRole;
    const restoredRole = previousRole === UserRole.SELLER && user.store ? UserRole.SELLER : UserRole.BUYER;
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.user.update({ where: { id }, data: { role: restoredRole }, select: { id: true, email: true, role: true, status: true } });
      if (user.store) await tx.sellerStore.update({ where: { ownerId: id }, data: { active: restoredRole === UserRole.SELLER && user.status === UserStatus.ACTIVE } });
      await tx.authSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.auditEvent.create({ data: { actorId, action: 'admin_access_removed', targetType: 'user', targetId: id, metadata: { restoredRole } } });
      return account;
    });
  }

  async getUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true, email: true, firstName: true, lastName: true, phone: true, country: true, region: true, role: true, status: true, emailVerifiedAt: true, createdAt: true, updatedAt: true, store: { select: { id: true, name: true, slug: true, active: true, verified: true } }, sellerApplication: { select: { id: true, status: true, submittedAt: true } } } });
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }

  async updateUserStatus(id: string, actorId: string, status: 'ACTIVE' | 'SUSPENDED') {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true, status: true, role: true } });
    if (!user) throw new NotFoundException('User not found.');
    if (user.id === actorId && status !== 'ACTIVE') throw new ConflictException('You cannot suspend your own admin account.');
    if (user.status === UserStatus.DELETED) throw new ConflictException('Deleted accounts cannot be reactivated.');
    if (user.role === UserRole.ADMIN && status !== 'ACTIVE') await this.ensureAnotherAdmin(id);
    const updated = await this.prisma.$transaction(async (tx) => {
      const account = await tx.user.update({ where: { id }, data: { status }, select: { id: true, email: true, role: true, status: true } });
      if (status !== 'ACTIVE') await tx.authSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.sellerStore.updateMany({ where: { ownerId: id }, data: { active: status === 'ACTIVE' && user.role === UserRole.SELLER } });
      await tx.auditEvent.create({ data: { actorId, action: status === 'SUSPENDED' ? 'user_suspended' : 'user_reactivated', targetType: 'user', targetId: id, metadata: { previousStatus: user.status, status } } });
      return account;
    });
    return updated;
  }

  async updateUserRole(id: string, actorId: string, role: 'BUYER' | 'SELLER' | 'ADMIN') {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true, role: true, status: true, store: { select: { id: true } } } });
    if (!user) throw new NotFoundException('User not found.');
    if (user.status === UserStatus.DELETED) throw new ConflictException('Deleted accounts cannot change roles.');
    if (id === actorId && role !== 'ADMIN') throw new ConflictException('You cannot remove your own admin role.');
    if (role === UserRole.SELLER && !user.store) throw new ConflictException('Approve a seller application before assigning the seller role.');
    if (user.role === UserRole.ADMIN && role !== UserRole.ADMIN) await this.ensureAnotherAdmin(id);
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.user.update({ where: { id }, data: { role }, select: { id: true, email: true, role: true, status: true } });
      await tx.sellerStore.updateMany({ where: { ownerId: id }, data: { active: role === UserRole.SELLER && user.status === UserStatus.ACTIVE } });
      await tx.authSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.auditEvent.create({ data: { actorId, action: 'user_role_changed', targetType: 'user', targetId: id, metadata: { previousRole: user.role, role } } });
      return account;
    });
  }

  async deleteUser(id: string, actorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true, role: true, status: true } });
    if (!user) throw new NotFoundException('User not found.');
    if (id === actorId) throw new ConflictException('You cannot delete your own account.');
    if (user.status === UserStatus.DELETED) throw new ConflictException('Account is already deleted.');
    if (user.role === UserRole.ADMIN) await this.ensureAnotherAdmin(id);
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.user.update({ where: { id }, data: { status: UserStatus.DELETED }, select: { id: true, email: true, role: true, status: true } });
      await tx.authSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.sellerStore.updateMany({ where: { ownerId: id }, data: { active: false } });
      await tx.auditEvent.create({ data: { actorId, action: 'user_deleted', targetType: 'user', targetId: id, metadata: { previousStatus: user.status } } });
      return account;
    });
  }

  private async ensureAnotherAdmin(excludedId: string) {
    const count = await this.prisma.user.count({ where: { role: UserRole.ADMIN, status: UserStatus.ACTIVE, id: { not: excludedId } } });
    if (count === 0) throw new ConflictException('The last active administrator cannot be removed or suspended.');
  }

  async listUserSessions(userId: string) {
    await this.getUser(userId);
    return this.prisma.authSession.findMany({ where: { userId }, select: { id: true, userAgent: true, ipAddress: true, createdAt: true, lastUsedAt: true, expiresAt: true, revokedAt: true }, orderBy: { createdAt: 'desc' } });
  }

  async revokeUserSession(userId: string, sessionId: string, actorId: string) {
    const session = await this.prisma.authSession.findFirst({ where: { id: sessionId, userId }, select: { id: true, revokedAt: true } });
    if (!session) throw new NotFoundException('Session not found.');
    await this.prisma.$transaction(async (tx) => {
      if (!session.revokedAt) await tx.authSession.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
      await tx.auditEvent.create({ data: { actorId, action: 'user_session_revoked', targetType: 'user', targetId: userId, metadata: { sessionId } } });
    });
    return { message: 'Session revoked.' };
  }

  async listAuditEvents(input: { targetId?: string; page?: string; pageSize?: string }) {
    const { page, pageSize, skip } = this.pagination(input.page, input.pageSize);
    const where = input.targetId ? { targetId: input.targetId } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditEvent.findMany({ where, skip, take: pageSize, orderBy: { createdAt: 'desc' }, include: { actor: { select: { id: true, email: true, firstName: true, lastName: true } } } }),
      this.prisma.auditEvent.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async listProducts(input: { q?: string; status?: string; page?: string; pageSize?: string }) {
    const { page, pageSize, skip } = this.pagination(input.page, input.pageSize);
    const q = input.q?.trim();
    const where = {
      ...(input.status && Object.values(ProductStatus).includes(input.status as ProductStatus) ? { status: input.status as ProductStatus } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' as const } }, { brand: { contains: q, mode: 'insensitive' as const } }, { slug: { contains: q, mode: 'insensitive' as const } }, { seller: { name: { contains: q, mode: 'insensitive' as const } } }] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({ where, skip, take: pageSize, orderBy: { createdAt: 'desc' }, select: { id: true, slug: true, name: true, brand: true, status: true, priceKobo: true, stock: true, createdAt: true, category: { select: { name: true, slug: true } }, seller: { select: { id: true, name: true, slug: true, owner: { select: { email: true } } } } } }),
      this.prisma.product.count({ where }),
    ]);
    return { items: items.map(({ priceKobo, ...item }) => ({ ...item, price: Number(priceKobo) / 100, seller: { id: item.seller.id, storeName: item.seller.name, handle: item.seller.slug, email: item.seller.owner.email } })), total, page, pageSize };
  }

  async getProduct(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id }, select: { id: true, slug: true, name: true, brand: true, description: true, highlights: true, specifications: true, condition: true, status: true, stock: true, priceKobo: true, createdAt: true, updatedAt: true, category: { select: { name: true, slug: true } }, seller: { select: { id: true, name: true, slug: true, owner: { select: { email: true } } } }, media: { select: { sortOrder: true, media: { select: { id: true, secureUrl: true, altText: true } } }, orderBy: { sortOrder: 'asc' } } } });
    if (!product) throw new NotFoundException('Product not found.');
    const { priceKobo, seller, ...rest } = product;
    return { ...rest, price: Number(priceKobo) / 100, seller: { id: seller.id, storeName: seller.name, handle: seller.slug, email: seller.owner.email } };
  }

  async updateProductStatus(id: string, actorId: string, status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED') {
    const product = await this.prisma.product.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!product) throw new NotFoundException('Product not found.');
    const next = status as ProductStatus;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({ where: { id }, data: { status: next, archivedAt: next === ProductStatus.ARCHIVED ? new Date() : null }, select: { id: true, name: true, status: true, archivedAt: true } });
      await tx.auditEvent.create({ data: { actorId, action: 'product_status_changed', targetType: 'product', targetId: id, metadata: { previousStatus: product.status, status: next } } });
      return updated;
    });
  }

  async archiveProduct(id: string, actorId: string) {
    const product = await this.prisma.product.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!product) throw new NotFoundException('Product not found.');
    if (product.status === ProductStatus.ARCHIVED) throw new ConflictException('Product is already archived.');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({ where: { id }, data: { status: ProductStatus.ARCHIVED, archivedAt: new Date() }, select: { id: true, name: true, status: true, archivedAt: true } });
      await tx.auditEvent.create({ data: { actorId, action: 'product_archived', targetType: 'product', targetId: id, metadata: { previousStatus: product.status } } });
      return updated;
    });
  }

  async listSellerApplications() {
    return this.prisma.sellerApplication.findMany({
      where: { status: SellerApplicationStatus.UNDER_REVIEW },
      select: {
        id: true,
        brandName: true,
        handle: true,
        description: true,
        categories: true,
        businessType: true,
        registrationNumber: true,
        businessPhone: true,
        businessEmail: true,
        country: true,
        region: true,
        city: true,
        address: true,
        ownerName: true,
        ownerBirthDate: true,
        idType: true,
        idDocumentMediaId: true,
        selfieMediaId: true,
        submittedAt: true,
        user: { select: { id: true, email: true } },
      },
      orderBy: { submittedAt: 'asc' },
    });
  }

  async reviewSellerApplication(
    applicationId: string,
    adminId: string,
    input: ReviewSellerApplicationDto,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const application = await transaction.sellerApplication.findUnique({
        where: { id: applicationId },
        include: {
          idDocumentMedia: { select: { id: true, visibility: true } },
          selfieMedia: { select: { id: true, visibility: true } },
        },
      });
      if (!application) {
        throw new NotFoundException('Seller application not found.');
      }
      if (application.status !== SellerApplicationStatus.UNDER_REVIEW) {
        throw new ConflictException(
          'Only applications under review can be approved or rejected.',
        );
      }
      if (
        !application.idDocumentMedia ||
        !application.selfieMedia ||
        application.idDocumentMedia.visibility !== 'PRIVATE' ||
        application.selfieMedia.visibility !== 'PRIVATE'
      ) {
        throw new ConflictException(
          'The private identity documents are not available for review.',
        );
      }

      const decision =
        input.decision === 'APPROVED'
          ? SellerApplicationStatus.APPROVED
          : SellerApplicationStatus.REJECTED;
      const updated = await transaction.sellerApplication.update({
        where: { id: application.id },
        data: {
          status: decision,
          reviewNote: input.reviewNote?.trim() || null,
          reviewedAt: new Date(),
        },
        select: {
          id: true,
          brandName: true,
          handle: true,
          status: true,
          reviewedAt: true,
          reviewNote: true,
        },
      });

      if (decision === SellerApplicationStatus.APPROVED) {
        const store = await transaction.sellerStore.create({
          data: {
            ownerId: application.userId,
            slug: application.handle,
            name: application.brandName,
            about: application.description,
            location: `${application.city}, ${application.region}`,
            verified: true,
            active: true,
            logoMediaId: application.logoMediaId,
            bannerMediaId: application.bannerMediaId,
            payoutAccount: {
              create: {
                bankCode: application.bankCode,
                bankName: application.bankName,
                accountNumberCiphertext: application.accountNumberCiphertext,
                accountName: application.accountName,
              },
            },
          },
          select: { id: true, slug: true, name: true, verified: true },
        });
        await transaction.user.update({ where: { id: application.userId }, data: { role: UserRole.SELLER } });
        await transaction.auditEvent.create({
          data: {
            actorId: adminId,
            action: 'seller_application_approved',
            targetType: 'seller_application',
            targetId: application.id,
            metadata: { storeId: store.id },
          },
        });
        return { application: updated, store };
      }

      await transaction.auditEvent.create({
        data: {
          actorId: adminId,
          action: 'seller_application_rejected',
          targetType: 'seller_application',
          targetId: application.id,
        },
      });
      return { application: updated };
    });
  }

  async getPrivateApplicationMediaUrl(applicationId: string, mediaId: string) {
    const media = await this.prisma.mediaAsset.findFirst({
      where: {
        id: mediaId,
        purpose: { in: ['KYC_DOCUMENT', 'KYC_SELFIE'] },
        visibility: 'PRIVATE',
        deletedAt: null,
        OR: [
          { applicationDocuments: { id: applicationId } },
          { applicationSelfies: { id: applicationId } },
        ],
      },
      select: {
        cloudinaryPublicId: true,
        format: true,
        resourceType: true,
      },
    });
    if (!media) {
      throw new NotFoundException('Private application media not found.');
    }

    const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.config.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET');
    if (!cloudName || !apiKey || !apiSecret) {
      throw new ServiceUnavailableException(
        'Cloudinary access is not configured.',
      );
    }
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });
    const expiresAt = Math.floor(Date.now() / 1000) + 5 * 60;
    return {
      url: cloudinary.utils.private_download_url(
        media.cloudinaryPublicId,
        media.format,
        {
          resource_type: media.resourceType as 'image' | 'video' | 'raw',
          type: 'authenticated',
          expires_at: expiresAt,
        },
      ),
      expiresAt: new Date(expiresAt * 1000).toISOString(),
    };
  }
}
