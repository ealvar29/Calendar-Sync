"use client";

import { useEffect, useState, useCallback } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  isToday,
  isBefore,
  startOfDay,
} from "date-fns";
import { createClient } from "@/lib/supabase";
import type { MemberWithProfile, AvailabilityStatus } from "@/types";

interface Props {
  groupId: string;
  currentUserId: string;
  members: MemberWithProfile[];
}

// dateStr (yyyy-MM-dd) → userId → status
type AvailMap = Record<string, Record<string, AvailabilityStatus>>;

export default function CalendarGrid({ groupId, currentUserId, members }: Props) {
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [availMap, setAvailMap] = useState<AvailMap>({});
  const [loading, setLoading] = useState(true);

  const fetchAvailability = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const start = format(startOfMonth(month), "yyyy-MM-dd");
    const end = format(endOfMonth(month), "yyyy-MM-dd");

    const { data } = await supabase
      .from("availability")
      .select("user_id, date, status")
      .eq("group_id", groupId)
      .gte("date", start)
      .lte("date", end);

    const map: AvailMap = {};
    for (const row of data ?? []) {
      if (!map[row.date]) map[row.date] = {};
      map[row.date][row.user_id] = row.status as AvailabilityStatus;
    }
    setAvailMap(map);
    setLoading(false);
  }, [groupId, month]);

  useEffect(() => {
    fetchAvailability();
  }, [fetchAvailability]);

  // Realtime subscription — stays open for the lifetime of the room page
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`avail-${groupId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "availability",
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const old = payload.old as { user_id: string; date: string };
            setAvailMap((prev) => {
              const next = { ...prev };
              if (next[old.date]) {
                const entry = { ...next[old.date] };
                delete entry[old.user_id];
                next[old.date] = entry;
              }
              return next;
            });
          } else {
            const rec = payload.new as {
              user_id: string;
              date: string;
              status: string;
            };
            setAvailMap((prev) => ({
              ...prev,
              [rec.date]: {
                ...(prev[rec.date] ?? {}),
                [rec.user_id]: rec.status as AvailabilityStatus,
              },
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId]);

  async function toggleDay(dateStr: string) {
    const current = availMap[dateStr]?.[currentUserId];
    const next: AvailabilityStatus | null =
      !current ? "free" : current === "free" ? "busy" : null;

    // Optimistic update
    setAvailMap((prev) => {
      const updated = { ...prev, [dateStr]: { ...(prev[dateStr] ?? {}) } };
      if (next) {
        updated[dateStr][currentUserId] = next;
      } else {
        delete updated[dateStr][currentUserId];
      }
      return updated;
    });

    const supabase = createClient();
    if (next) {
      await supabase.from("availability").upsert(
        {
          user_id: currentUserId,
          group_id: groupId,
          date: dateStr,
          status: next,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,group_id,date" }
      );
    } else {
      await supabase
        .from("availability")
        .delete()
        .eq("user_id", currentUserId)
        .eq("group_id", groupId)
        .eq("date", dateStr);
    }
  }

  const monthStart = startOfMonth(month);
  const days = eachDayOfInterval({ start: monthStart, end: endOfMonth(month) });
  const paddingCount = getDay(monthStart);
  const today = startOfDay(new Date());

  const allFreeDays = days.filter((day) => {
    if (members.length === 0) return false;
    const dateStr = format(day, "yyyy-MM-dd");
    return members.every((m) => availMap[dateStr]?.[m.user_id] === "free");
  });

  return (
    <div className="space-y-4">
      {/* Calendar card */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        {/* Month navigator */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() =>
              setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))
            }
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 text-lg transition-colors"
          >
            ‹
          </button>
          <span className="font-semibold text-slate-800">
            {format(month, "MMMM yyyy")}
          </span>
          <button
            onClick={() =>
              setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))
            }
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 text-lg transition-colors"
          >
            ›
          </button>
        </div>

        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 mb-1">
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
            <div
              key={d}
              className="text-center text-xs font-medium text-slate-400 py-1"
            >
              {d}
            </div>
          ))}
        </div>

        {loading ? (
          <div className="h-48 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: paddingCount }).map((_, i) => (
              <div key={`pad-${i}`} />
            ))}
            {days.map((day) => {
              const dateStr = format(day, "yyyy-MM-dd");
              const dayAvail = availMap[dateStr] ?? {};
              const myStatus = dayAvail[currentUserId];
              const isPast = isBefore(day, today);

              const cellClass = [
                "flex flex-col min-h-[64px] rounded-xl border p-1.5 text-left transition-all",
                myStatus === "free"
                  ? "bg-blue-50 border-blue-200"
                  : myStatus === "busy"
                  ? "bg-red-50 border-red-200"
                  : "bg-white border-slate-200",
                isPast
                  ? "opacity-35 cursor-default"
                  : "hover:shadow-sm active:scale-95 cursor-pointer",
                isToday(day) ? "ring-2 ring-brand-400 ring-offset-1" : "",
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <button
                  key={dateStr}
                  onClick={() => !isPast && toggleDay(dateStr)}
                  disabled={isPast}
                  className={cellClass}
                >
                  <span
                    className={`text-xs font-semibold ${
                      isToday(day) ? "text-brand-600" : "text-slate-600"
                    }`}
                  >
                    {format(day, "d")}
                  </span>
                  {/* Member status dots */}
                  <div className="flex flex-wrap gap-0.5 mt-auto pt-1">
                    {members.map((member) => {
                      const status = dayAvail[member.user_id];
                      if (!status) return null;
                      return (
                        <span
                          key={member.user_id}
                          title={`${member.display_name}: ${status}`}
                          className={[
                            "inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold text-white",
                            status === "free" ? "bg-blue-400" : "bg-red-400",
                            member.user_id === currentUserId
                              ? "ring-1 ring-slate-400 ring-offset-[1px]"
                              : "",
                          ].join(" ")}
                        >
                          {member.display_name[0]?.toUpperCase()}
                        </span>
                      );
                    })}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-blue-100 border border-blue-200 inline-block" />
            Free
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-red-100 border border-red-200 inline-block" />
            Busy
          </span>
          <span className="ml-auto">Click a day to toggle your status</span>
        </div>
      </div>

      {/* Everyone's free panel */}
      {allFreeDays.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="font-semibold text-slate-800 mb-3">
            Everyone&apos;s free 🎉
          </h3>
          <div className="flex flex-wrap gap-2">
            {allFreeDays.map((day) => (
              <span
                key={format(day, "yyyy-MM-dd")}
                className="px-3 py-1.5 bg-green-50 border border-green-200 text-green-800 rounded-full text-sm font-medium"
              >
                {format(day, "EEE, MMM d")}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
