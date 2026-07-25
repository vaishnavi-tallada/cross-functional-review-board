import { McpApp, Module, ConfigModule } from '@nitrostack/core';
import { SecurityModule } from './modules/security/security.module.js';
import { SystemHealthCheck } from './health/system.health.js';
import { GeminiHealthCheck } from './health/gemini.health.js';

/**
 * Root Application Module
 * 
 * This is the main module that bootstraps the MCP server.
 * It registers all feature modules and health checks.
 */
@McpApp({
  module: AppModule,
  server: {
    name: 'cfrb-mcp-server',
    version: '1.0.0'
  },
  logging: {
    level: 'info'
  }
})
@Module({
  name: 'app',
  description: 'Root application module',
  imports: [
    ConfigModule.forRoot(),
    SecurityModule
  ],
  providers: [
    // Health Checks
    SystemHealthCheck,
    GeminiHealthCheck,
  ]
})
export class AppModule {}

