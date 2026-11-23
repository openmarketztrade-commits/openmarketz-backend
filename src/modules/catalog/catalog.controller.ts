import { Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/public.decorator.js';
import { CurrentUser } from '../../common/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/authenticated-user.js';
import { CatalogService } from './catalog.service.js';
import { ListProductsDto } from './dto/list-products.dto.js';

@ApiTags('Catalogue')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Public()
  @Get('categories')
  @ApiOperation({ summary: 'List active product categories' })
  listCategories() {
    return this.catalog.listCategories();
  }

  @Public()
  @Get('products')
  @ApiOperation({ summary: 'Browse active public products' })
  listProducts(@Query() query: ListProductsDto) {
    return this.catalog.listPublicProducts(query);
  }

  @Public()
  @Get('stores')
  @ApiOperation({ summary: 'List active public seller stores' })
  listStores() {
    return this.catalog.listPublicStores();
  }

  @Public()
  @Get('stores/:slug')
  @ApiOperation({ summary: 'Read an active public seller store' })
  getStore(@Param('slug') slug: string) {
    return this.catalog.getPublicStore(slug);
  }

  @Public()
  @Get('stores/:slug/reviews')
  @ApiOperation({ summary: 'List published reviews for a store' })
  listStoreReviews(@Param('slug') slug: string) {
    return this.catalog.listPublicStoreReviews(slug);
  }

  @Get('stores/:slug/follow')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Read the current user’s follow status for a store' })
  getFollowStatus(@CurrentUser() user: AuthenticatedUser, @Param('slug') slug: string) {
    return this.catalog.getStoreFollowStatus(user.id, slug);
  }

  @Post('stores/:slug/follow')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Follow a store' })
  followStore(@CurrentUser() user: AuthenticatedUser, @Param('slug') slug: string) {
    return this.catalog.followStore(user.id, slug);
  }

  @Delete('stores/:slug/follow')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Unfollow a store' })
  unfollowStore(@CurrentUser() user: AuthenticatedUser, @Param('slug') slug: string) {
    return this.catalog.unfollowStore(user.id, slug);
  }

  @Public()
  @Get('stores/:slug/products')
  @ApiOperation({ summary: 'Browse active products from a seller store' })
  listStoreProducts(
    @Param('slug') slug: string,
    @Query() query: ListProductsDto,
  ) {
    return this.catalog.listPublicProducts(
      Object.assign(new ListProductsDto(), query, { sellerSlug: slug }),
    );
  }

  @Public()
  @Get('products/:slug')
  @ApiOperation({ summary: 'Read an active public product by slug' })
  getProduct(@Param('slug') slug: string) {
    return this.catalog.getPublicProduct(slug);
  }
}
