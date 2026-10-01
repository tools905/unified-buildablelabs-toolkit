"use client";

import { useState } from "react";
import { MAX_ASSIGNEES, orderAssignees } from "@/lib/utils/content-board";
import type { ContentMemberOption } from "@/components/content-board/types";

// Admins pick who an idea is assigned to. Every chosen person is submitted with the form as
// `assigneeIds`; `assigneesField` marks that the picker was on the form, so an empty list means
// "nobody" (and a form without the picker leaves the assignees as they are).
export function AssigneePicker({
  members,
  initial = [],
  currentUserId,
}: {
  members: ContentMemberOption[];
  // People already assigned. Someone who has since left the workspace is not in `members`,
  // but must stay visible so saving doesn't silently drop them without a choice.
  initial?: ContentMemberOption[];
  currentUserId: string;
}) {
  const [selected, setSelected] = useState<string[]>(initial.map((person) => person.id));

  const known = new Set(members.map((member) => member.id));
  const people = [...members, ...initial.filter((person) => !known.has(person.id))];
  const { frequent, others } = orderAssignees(people);
  const full = selected.length >= MAX_ASSIGNEES;

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  }

  // One plain list: the usual four first, then everyone else.
  const ordered = [...frequent, ...others];

  return (
    <fieldset>
      <legend className="text-sm font-medium leading-none">Assign to (optional)</legend>
      <input type="hidden" name="assigneesField" value="1" />
      {selected.map((id) => (
        <input key={id} type="hidden" name="assigneeIds" value={id} />
      ))}
      <div className="mt-1 max-h-48 overflow-y-auto border border-border">
        <div className="divide-y divide-border">
          {ordered.map((person) => {
            const checked = selected.includes(person.id);
            return (
              <label key={person.id} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/50">
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0 accent-primary"
                  checked={checked}
                  disabled={!checked && full}
                  onChange={() => toggle(person.id)}
                />
                <span className="min-w-0 truncate">
                  {person.label}
                  {person.id === currentUserId ? " (you)" : ""}
                </span>
              </label>
            );
          })}
        </div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {selected.length === 0
          ? "Nobody assigned. Tick one or more people; they get a notification."
          : `${selected.length} assigned${full ? " (the most allowed)" : ""}. Newly assigned people get a notification.`}
      </p>
    </fieldset>
  );
}
