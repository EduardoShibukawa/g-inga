import { Database } from "bun:sqlite";
import { getPhase, setPhase } from "./plan_phase";

export type ActionCmd = "red" | "run" | "judge" | "merge" | "replan" | "notify" | "none";

export type Action = {
  cmd: ActionCmd;
  plan: string;
  task?: string;
  reason: string;
};

export type TaskState = {
  id: string;
  status: "open" | "pass" | "fail" | "blocked";
  attempts: number;
  deps_done: boolean;
};

export type PlanState = {
  phase: string;
  tasks: TaskState[];
  cap_ok: boolean;
  judge?: "pass" | "high" | string;
};

function planIdFromTaskId(taskId: string): string {
  if (taskId.includes("/")) {
    return taskId.split("/")[0]!;
  }
  return taskId;
}

function shortTaskId(taskId: string): string {
  if (taskId.includes("/")) {
    return taskId.slice(taskId.lastIndexOf("/") + 1);
  }
  return taskId;
}

export function nextAction(state: PlanState): Action {
  const plan = state.tasks[0] ? planIdFromTaskId(state.tasks[0].id) : "";
  const cap_ok = state.cap_ok !== false;

  if (cap_ok === false) {
    return {
      cmd: "notify",
      plan,
      reason: "capacidade/limites indisponíveis",
    };
  }

  if (state.phase === "approved") {
    return {
      cmd: "red",
      plan,
      reason: "plano aprovado → iniciar RED",
    };
  }

  if (state.phase === "red") {
    // Check if there's an open task with deps done
    const openTask = state.tasks.find((t) => t.status === "open" && t.deps_done);
    if (openTask) {
      return {
        cmd: "run",
        plan,
        task: shortTaskId(openTask.id),
        reason: "executar tarefa aberta com dependências prontas",
      };
    }
    // If all pass or no open tasks to run? Or could be other cases
    const allPass = state.tasks.length > 0 && state.tasks.every((t) => t.status === "pass");
    if (allPass) {
      return {
        cmd: "judge",
        plan,
        reason: "todas as tarefas aprovadas → juiz",
      };
    }
    return {
      cmd: "none",
      plan,
      reason: "sem ação",
    };
  }

  if (state.phase === "tasks") {
    // Check for tasks with 3 failures
    const failedTask = state.tasks.find((t) => t.status === "fail" && t.attempts >= 3);
    if (failedTask) {
      return {
        cmd: "replan",
        plan,
        task: shortTaskId(failedTask.id),
        reason: "tarefa com 3 falhas → replan",
      };
    }
    const openTask = state.tasks.find((t) => t.status === "open" && t.deps_done);
    if (openTask) {
      return {
        cmd: "run",
        plan,
        task: shortTaskId(openTask.id),
        reason: "executar tarefa aberta com dependências prontas",
      };
    }
    const allPass = state.tasks.length > 0 && state.tasks.every((t) => t.status === "pass");
    if (allPass) {
      return {
        cmd: "judge",
        plan,
        reason: "todas as tarefas aprovadas → juiz",
      };
    }
    return {
      cmd: "none",
      plan,
      reason: "sem ação",
    };
  }

  if (state.phase === "judge") {
    if (state.judge === "pass") {
      return {
        cmd: "merge",
        plan,
        reason: "juiz aprovou → merge",
      };
    }
    if (state.judge === "high") {
      return {
        cmd: "replan",
        plan,
        reason: "juiz com alta gravidade → replan",
      };
    }
    return {
      cmd: "none",
      plan,
      reason: "aguardando decisão do juiz",
    };
  }

  if (state.phase === "done") {
    return {
      cmd: "none",
      plan,
      reason: "concluído",
    };
  }

  return {
    cmd: "none",
    plan,
    reason: "sem ação",
  };
}
