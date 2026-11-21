import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { ShipbubbleService } from './shipbubble.service.js';

@Module({
  imports: [PaymentsModule],
  controllers: [OrdersController],
  providers: [OrdersService, ShipbubbleService],
  exports: [OrdersService],
})
export class OrdersModule {}
