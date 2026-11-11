import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarIcon, ListTodoIcon, SirenIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import { db } from "../db";
import {
  FILTERS,
  PRIORITY_FILTERS,
  groupTasks,
  groupTasksByPriority,
  type PriorityFilter,
  type TaskFilter,
} from "../selectors";
import { useTaskUi } from "../store";
import { PRIORITY_META, type Priority } from "../types";
import { PriorityDot } from "./priority-badge";
import { TaskItem } from "./task-item";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return "Boa noite";
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

const DATE_EMPTY: Record<TaskFilter, string> = {
  all: "Nenhuma tarefa pendente.",
  today: "Nada para hoje.",
  tomorrow: "Nada para amanhã.",
  week: "Nada agendado para esta semana.",
  month: "Nada agendado para os próximos 30 dias.",
};

function priorityEmpty(filter: PriorityFilter) {
  if (filter === "all") return "Nenhuma tarefa pendente.";
  if (filter === "none") return "Nenhuma tarefa pendente sem prioridade.";
  return `Nenhuma tarefa pendente com prioridade ${PRIORITY_META[filter as Priority].label.toLowerCase()}.`;
}

const chipClass = (selected: boolean) =>
  cn(
    "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors",
    selected
      ? "border-brand bg-brand font-medium text-background"
      : "bg-card text-muted-foreground hover:text-foreground",
  );

const VIEWS = [
  { value: "date", label: "Listar por período", Icon: CalendarIcon },
  { value: "priority", label: "Listar por prioridade", Icon: SirenIcon },
] as const;

export function FilterChips() {
  const view = useTaskUi((s) => s.view);
  const setView = useTaskUi((s) => s.setView);
  const filter = useTaskUi((s) => s.filter);
  const setFilter = useTaskUi((s) => s.setFilter);
  const priorityFilter = useTaskUi((s) => s.priorityFilter);
  const setPriorityFilter = useTaskUi((s) => s.setPriorityFilter);

  return (
    <div className="flex items-center gap-2">
      <div
        role="radiogroup"
        aria-label="Tipo de lista"
        className="flex shrink-0 rounded-full border bg-card p-0.5"
      >
        {VIEWS.map(({ value, label, Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={view === value}
            aria-label={label}
            title={label}
            onClick={() => setView(value)}
            className={cn(
              "flex size-[30px] items-center justify-center rounded-full transition-colors",
              view === value
                ? "bg-brand text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
          </button>
        ))}
      </div>
      <div
        role="tablist"
        className="-mr-4 flex min-w-0 flex-1 gap-2 overflow-x-auto pr-4 [scrollbar-width:none]"
      >
        {view === "priority"
          ? PRIORITY_FILTERS.map((f) => (
              <button
                key={f.value}
                role="tab"
                aria-selected={priorityFilter === f.value}
                onClick={() => setPriorityFilter(f.value)}
                className={chipClass(priorityFilter === f.value)}
              >
                {f.value !== "all" && <PriorityDot priority={f.value} />}
                {f.label}
              </button>
            ))
          : FILTERS.map((f) => (
              <button
                key={f.value}
                role="tab"
                aria-selected={filter === f.value}
                onClick={() => setFilter(f.value)}
                className={chipClass(filter === f.value)}
              >
                {f.label}
              </button>
            ))}
      </div>
    </div>
  );
}

const DONE_PAGE = 5;

export function TaskList() {
  const view = useTaskUi((s) => s.view);
  const filter = useTaskUi((s) => s.filter);
  const priorityFilter = useTaskUi((s) => s.priorityFilter);
  const tasks = useLiveQuery(
    () => db.tasks.filter((task) => !task.deletedAt).toArray(),
    [],
  );
  const [doneVisible, setDoneVisible] = useState(DONE_PAGE);

  if (!tasks) return null;

  if (tasks.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <ListTodoIcon className="size-10 text-brand" aria-hidden />
        <h2 className="text-3xl font-semibold tracking-tight">{greeting()}</h2>
        <p className="max-w-xs text-sm text-muted-foreground">
          Toque no botão de áudio e diga algo como{" "}
          <span className="text-foreground">
            “Pagar a conta de luz amanhã às 10, prioridade alta”
          </span>
          .
        </p>
      </div>
    );
  }

  const byPriority = view === "priority";
  const groups = byPriority
    ? groupTasksByPriority(tasks, priorityFilter)
    : groupTasks(tasks, filter);

  if (groups.length === 0) {
    const message = byPriority
      ? priorityEmpty(priorityFilter)
      : DATE_EMPTY[filter];
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        {message}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => {
        const isDone = group.key === "done";
        const shown = isDone ? group.tasks.slice(0, doneVisible) : group.tasks;
        return (
          <section key={group.key} aria-labelledby={`group-${group.key}`}>
            <h2
              id={`group-${group.key}`}
              className={cn(
                "mb-2 flex items-center gap-2 px-1 text-lg leading-none font-semibold tracking-tight",
                group.key === "overdue" && "text-destructive",
              )}
            >
              {group.priority && (
                <PriorityDot
                  priority={group.priority}
                  className="self-center"
                />
              )}
              {group.label}
              <span className="num text-sm text-muted-foreground">
                {group.tasks.length}
              </span>
            </h2>
            <ul className="flex flex-col divide-y overflow-hidden rounded-[22px] bg-card">
              {shown.map((task) => (
                <TaskItem key={task.id} task={task} />
              ))}
            </ul>
            {isDone && shown.length < group.tasks.length && (
              <button
                type="button"
                onClick={() => setDoneVisible((n) => n + DONE_PAGE)}
                className="mt-3 h-11 w-full rounded-full border bg-card text-sm font-medium transition-colors hover:bg-muted"
              >
                Carregar mais ({group.tasks.length - shown.length})
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}
