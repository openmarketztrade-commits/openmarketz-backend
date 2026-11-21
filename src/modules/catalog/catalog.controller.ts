import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/public.decorator.js';
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
  @Get('stores/:slug')
  @ApiOperation({ summary: 'Read an active public seller store' })
  getStore(@Param('slug') slug: string) {
    return this.catalog.getPublicStore(slug);
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
