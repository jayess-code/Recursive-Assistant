import { TaskService } from "../../Api/tasks/taskService";
import type { ToolExecutionContext } from "../toolExecutor";

/**
 * Execute a tool asynchronously by creating a Task record.
 * Returns immediately with task ID; actual execution happens in the scheduler.
 */
export async function executeQueue(
  toolName: string,
  args: any,
  context: ToolExecutionContext
) {
  try {
    const conversationId = context.conversationId ?? context.assistantId;

    // Create a tool execution task in the database
    const task = await TaskService.schedule({
      agentId: context.assistantId,
      conversationId,
      runAt: new Date(), // Execute immediately on next scheduler tick
      type: "tool_execution",
      data: {
        toolName,
        args,
      },
      maxAttempts: 3,
    });

    // Return task ID immediately (non-blocking)
    return {
      taskId: task._id?.toString(),
      queued: true,
      status: "pending",
    };
  } catch (error) {
    throw new Error(`Failed to queue tool execution: ${error instanceof Error ? error.message : String(error)}`);
  }
}