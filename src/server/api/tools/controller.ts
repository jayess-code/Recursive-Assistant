import type { Request, Response } from "express";
import { localTools } from "../../../Tools";
import type { ToolConfig, ToolInfo, ToolParameters } from "../../../Runtime/ToolExecutor/toolConfig";
import { catchAsync } from "../utils/catchAsync";
import AppError from "../utils/errorHandlers/appError";
import ToolModel from "./shema";

type PersistableTool = {
  type: "function";
  name: string;
  description: string;
  parameters: ToolParameters;
  exampleCalls?: unknown[];
  env?: string;
  display_width?: number;
  display_height?: number;
  strict: boolean;
  schemaVersion?: string;
};

const isMcpInfo = (info: ToolInfo): info is Extract<ToolInfo, { source: "mcp" }> => {
  return info?.source === "mcp";
};

const toPersistableTool = (config: ToolConfig): PersistableTool => {
  const { handler: _handler, validate: _validate, ...tool } = config.tool;

  return {
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    exampleCalls: tool.exampleCalls as unknown[] | undefined,
    env: typeof tool.env === "string" ? tool.env : undefined,
    display_width:
      typeof tool.display_width === "number" ? tool.display_width : undefined,
    display_height:
      typeof tool.display_height === "number" ? tool.display_height : undefined,
    strict: tool.strict ?? true,
    schemaVersion: tool.schemaVersion,
  };
};

const toPersistableInfo = (info: ToolInfo): Record<string, unknown> => {
  const persisted: Record<string, unknown> = {
    ...info,
  };

  return persisted;
};

const toolsController = {
  listTools: catchAsync(async (_req: Request, res: Response) => {
    const tools = await ToolModel.find().sort({ "tool.name": 1 });

    res.status(200).json({
      status: "success",
      total: tools.length,
      data: tools,
    });
  }),

  getToolByName: catchAsync(async (req: Request, res: Response, next) => {
    const tool = await ToolModel.findOne({ "tool.name": req.params.name });

    if (!tool) {
      return next(new AppError("Tool not found", 404));
    }

    res.status(200).json({
      status: "success",
      data: tool,
    });
  }),

  syncLocalTools: catchAsync(async (_req: Request, res: Response) => {
    const entries = Object.entries(localTools);

    if (entries.length === 0) {
      return res.status(200).json({
        status: "success",
        message: "No local tools to sync",
        total: 0,
      });
    }

    const operations = entries.map(([toolName, config]) => {
      const tool = toPersistableTool(config);
      const info = toPersistableInfo(config.info);
      const source = config.info.source ?? "local";

      const update: Record<string, unknown> = {
        tool: {
          ...tool,
          name: toolName,
        },
        info,
        source,
      };

      if (isMcpInfo(config.info)) {
        update.mcp = {
          server: config.info.mcp.server,
          toolName: config.info.mcp.toolName,
          namespace: config.info.mcp.namespace,
        };
      }

      return {
        updateOne: {
          filter: { "tool.name": toolName },
          update,
          upsert: true,
        },
      };
    });

    const result = await ToolModel.bulkWrite(operations, { ordered: false });

    res.status(200).json({
      status: "success",
      message: "Tool registry synced from local tools",
      data: {
        matched: result.matchedCount,
        modified: result.modifiedCount,
        upserted: result.upsertedCount,
        totalLocalTools: entries.length,
      },
    });
  }),

  executeTool: catchAsync(async (req: Request, res: Response, next) => {
    const { name, args } = req.body as { name?: string; args?: unknown };

    if (!name || typeof name !== "string") {
      return next(new AppError("Request body must include a valid tool name", 400));
    }

    const toolConfig = localTools[name];

    if (!toolConfig?.tool?.handler) {
      return next(new AppError(`Unknown tool: ${name}`, 404));
    }

    if (toolConfig.info.access === "admin" && req.user?.role !== "admin") {
      return next(new AppError("You do not have permission to execute this tool", 403));
    }

    const currentEnv = process.env.NODE_ENV ?? "development";
    const allowedEnvironments = toolConfig.info.allowedEnvironments;
    if (
      Array.isArray(allowedEnvironments) &&
      allowedEnvironments.length > 0 &&
      !allowedEnvironments.includes(
        currentEnv as "development" | "test" | "staging" | "production"
      )
    ) {
      return next(
        new AppError(
          `Tool '${name}' is disabled in environment '${currentEnv}'`,
          403
        )
      );
    }

    if (toolConfig.tool.validate) {
      const isValid = await toolConfig.tool.validate(args as never);
      if (!isValid) {
        return next(new AppError("Tool arguments failed validation", 400));
      }
    }

    const result = await toolConfig.tool.handler((args ?? {}) as never, {
      availableTools: Object.keys(localTools),
    });

    res.status(200).json({
      status: "success",
      data: {
        name,
        result,
      },
    });
  }),
};

export default toolsController;
