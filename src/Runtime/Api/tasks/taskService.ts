type ScheduledTaskInput = {
  agentId: string;
  conversationId: string;
  runAt: Date;
  type: string;
  data: Record<string, unknown>;
  maxAttempts?: number;
};

type ScheduledTask = ScheduledTaskInput & {
  _id: string;
  status: "pending" | "completed" | "failed";
  attempts: number;
};

export class TaskService {
  static async schedule(task: ScheduledTaskInput): Promise<ScheduledTask> {
    return {
      ...task,
      _id: `task-${Date.now()}`,
      status: "pending",
      attempts: 0,
    };
  }
}
