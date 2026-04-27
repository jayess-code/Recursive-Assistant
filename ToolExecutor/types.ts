export interface IToolCall {
  name: string;
  args: any;
  result?: any;
  status?: "pending" | "completed" | "failed";
  
//   timestamp: Date;
  callId: string;
}
