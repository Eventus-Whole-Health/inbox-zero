/**
 * Enhanced Logging Configuration for Inbox Zero
 *
 * Supports multiple logging backends:
 * - Application Insights (Azure)
 * - Seq (Structured Logging)
 * - Axiom (existing)
 * - Console (development)
 */

import { env } from "@/env";
import pino from "pino";
import type { Logger as PinoLogger } from "pino";

// Lazy imports to avoid loading in environments where they're not needed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const appInsights: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let seqTransport: any = null;

export interface LoggerConfig {
  appInsightsEnabled: boolean;
  seqEnabled: boolean;
  axiomEnabled: boolean;
}

let _config: LoggerConfig | null = null;
let _pinoLogger: PinoLogger | null = null;

/**
 * Initialize logging configuration
 * Should be called once at application startup
 */
export function initializeLogging(): LoggerConfig {
  if (_config) return _config;

  const config: LoggerConfig = {
    appInsightsEnabled: false,
    seqEnabled: false,
    axiomEnabled: !!env.NEXT_PUBLIC_AXIOM_TOKEN,
  };

  // Application Insights initialization is disabled for local development
  // The applicationinsights package has dependencies that break with Next.js Turbopack
  // TODO: Re-enable for production Docker builds by using a separate entry point
  if (env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
    console.log(
      "⚠️ Application Insights configured but disabled for local dev (bundling issues)",
    );
  }

  // Initialize Seq
  if (env.SEQ_SERVER_URL) {
    try {
      seqTransport = require("pino-seq");

      const streams: Array<{ level?: string; stream: any }> = [
        // Console stream for development
        { stream: pino.destination(1) },
      ];

      // Add Seq stream
      streams.push({
        level: "info",
        stream: seqTransport.createStream({
          serverUrl: env.SEQ_SERVER_URL,
          apiKey: env.SEQ_API_KEY || undefined,
          onError: (error: Error) => {
            console.error("Seq logging error:", error);
          },
        }),
      });

      _pinoLogger = pino(
        {
          level: env.NODE_ENV === "production" ? "info" : "debug",
          base: {
            AppName: env.APP_NAME || "inbox-zero",
            Environment: env.NODE_ENV || "development",
            AppVersion: env.APP_VERSION || "1.0.0",
            Region: env.AZURE_REGION || "eastus2",
          },
          timestamp: pino.stdTimeFunctions.isoTime,
        },
        pino.multistream(streams),
      );

      config.seqEnabled = true;
      console.log("✅ Seq logging initialized");
    } catch (error) {
      console.error("Failed to initialize Seq logging:", error);
    }
  }

  _config = config;
  return config;
}

/**
 * Get the current logging configuration
 */
export function getLoggingConfig(): LoggerConfig {
  if (!_config) {
    return initializeLogging();
  }
  return _config;
}

/**
 * Get the Pino logger instance (for Seq logging)
 */
export function getPinoLogger(): PinoLogger | null {
  return _pinoLogger;
}

/**
 * Get the Application Insights client
 */
export function getAppInsightsClient() {
  return appInsights?.defaultClient || null;
}

/**
 * Track a custom event in Application Insights
 */
export function trackEvent(
  name: string,
  properties?: Record<string, unknown>,
  measurements?: Record<string, number>,
) {
  const client = getAppInsightsClient();
  if (!client) return;

  try {
    client.trackEvent({
      name,
      properties: properties as Record<string, string>,
      measurements,
    });
  } catch (error) {
    console.error("Failed to track event:", error);
  }
}

/**
 * Track an exception in Application Insights
 */
export function trackException(
  error: Error,
  properties?: Record<string, unknown>,
) {
  const client = getAppInsightsClient();
  if (!client) return;

  try {
    client.trackException({
      exception: error,
      properties: properties as Record<string, string>,
    });
  } catch (err) {
    console.error("Failed to track exception:", err);
  }
}

/**
 * Flush all logging buffers
 * Should be called before application shutdown
 */
export async function flushLogs(): Promise<void> {
  const promises: Promise<void>[] = [];

  // Flush Application Insights
  if (appInsights?.defaultClient) {
    promises.push(
      new Promise<void>((resolve) => {
        appInsights!.defaultClient.flush({
          callback: () => resolve(),
        });
      }),
    );
  }

  // Flush Pino/Seq
  if (_pinoLogger) {
    promises.push(
      new Promise<void>((resolve) => {
        _pinoLogger!.flush(() => resolve());
      }),
    );
  }

  await Promise.all(promises);
}
