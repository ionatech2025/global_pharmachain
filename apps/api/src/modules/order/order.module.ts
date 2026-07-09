import { Module } from "@nestjs/common";
import { DocumentModule } from "../document/document.module";
import { ShipmentController } from "../shipment/shipment.controller";
import { ShipmentService } from "../shipment/shipment.service";
import { OrderController } from "./order.controller";

// Shipment visibility (Epic 7) lives on orders; both controllers share the
// /orders route space, so they ship in one module.
@Module({
  imports: [DocumentModule],
  controllers: [OrderController, ShipmentController],
  providers: [ShipmentService],
})
export class OrderModule {}
