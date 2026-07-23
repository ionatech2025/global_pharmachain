import { Module } from "@nestjs/common";
import { SavedSearchController } from "./saved-search.controller";

@Module({ controllers: [SavedSearchController] })
export class SavedSearchModule {}
