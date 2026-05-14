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
  parseISO,
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

const PICKER_OPTIONS: { status: AvailabilityStatus; label: string; icon: string }[] = [
  { status: "day", label: "Day", icon: "☀️" },
  { status: "night", label: "Night", icon: "🌙" },
  { status: "busy", label: "Busy", icon: "🔴" },
  { status: "free", label: "Free", icon: "✅" },
];

export default function CalendarGrid({ groupId, currentUserId, members }: Props) {
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [availMap, setAvailMap] = useState<AvailMap>({});
  const [notesMap, setNotesMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [activeNoteDate, setActiveNoteDate] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState("");
  const [openPickerDate, setOpenPickerDate] = useState<string | null>(null);

  const fetchMonthData = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const start = format(startOfMonth(month), "yyyy-MM-dd");
    const end = format(endOfMonth(month), "yyyy-MM-dd");

    const [{ data: availData }, { data: notesData }] = await Promise.all([
      supabase
        .from("availability")
        .select("user_id, date, status")
        .eq("group_id", groupId)
        .gte("date", start)
        .lte("date", end),
      supabase
        .from("notes")
        .select("date, text")
        .eq("group_id", groupId)
        .gte("date", start)
        .lte("date", end),
    ]);

    const aMap: AvailMap = {};
    for (const row of availData ?? []) {
      if (!aMap[row.date]) aMap[row.date] = {};
      aMap[row.date][row.user_id] = row.status as AvailabilityStatus;
    }
    setAvailMap(aMap);

    const nMap: Record<string, string> = {};
    for (const row of notesData ?? []) {
      nMap[row.date] = row.text;
    }
    setNotesMap(nMap);

    setLoading(false);
  }, [groupId, month]);

  useEffect(() => {
    fetchMonthData();
  }, [fetchMonthData]);

  useEffect(() => {
    setActiveNoteDate(null);
    setOpenPickerDate(null);
  }, [month]);

  // Close picker when clicking outside
  useEffect(() => {
    if (!openPickerDate) return;
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest("[data-picker]")) {
        setOpenPickerDate(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openPickerDate]);

  // Realtime subscription for availability and notes
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
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notes",
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const old = payload.old as { date: string };
            setNotesMap((prev) => {
              const next = { ...prev };
              delete next[old.date];
              return next;
            });
          } else {
            const rec = payload.new as { date: string; text: string };
            setNotesMap((prev) => ({ ...prev, [rec.date]: rec.text }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId]);

  async function setDayStatus(dateStr: string, status: AvailabilityStatus | null) {
    setOpenPickerDate(null);
    setAvailMap((prev) => {
      const updated = { ...prev, [dateStr]: { ...(prev[dateStr] ?? {}) } };
      if (status) {
        updated[dateStr][currentUserId] = status;
      } else {
        delete updated[dateStr][currentUserId];
      }
      return updated;
    });

    const supabase = createClient();
    if (status) {
      await supabase.from("availability").upsert(
        {
          user_id: currentUserId,
          group_id: groupId,
          date: dateStr,
          status,
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

  async function saveNote(dateStr: string, text: string) {
    const trimmed = text.trim();
    const supabase = createClient();
    if (!trimmed) {
      setNotesMap((prev) => {
        const next = { ...prev };
        delete next[dateStr];
        return next;
      });
      await supabase
        .from("notes")
        .delete()
        .eq("group_id", groupId)
        .eq("date", dateStr);
    } else {
      setNotesMap((prev) => ({ ...prev, [dateStr]: trimmed }));
      await supabase.from("notes").upsert(
        {
          group_id: groupId,
          date: dateStr,
          text: trimmed,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "group_id,date" }
      );
    }
  }

  function openNote(dateStr: string) {
    setActiveNoteDate(dateStr);
    setNoteInput(notesMap[dateStr] ?? "");
  }

  const monthStart = startOfMonth(month);
  const days = eachDayOfInterval({ start: monthStart, end: endOfMonth(month) });
  const paddingCount = getDay(monthStart);
  const today = startOfDay(new Date());

  const allDayDays = days.filter((day) => {
    if (members.length === 0) return false;
    const dateStr = format(day, "yyyy-MM-dd");
    return members.every((m) => availMap[dateStr]?.[m.user_id] === "day");
  });

  const allNightDays = days.filter((day) => {
    if (members.length === 0) return false;
    const dateStr = format(day, "yyyy-MM-dd");
    return members.every((m) => availMap[dateStr]?.[m.user_id] === "night");
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
              const hasNote = !!notesMap[dateStr];
              const isPickerOpen = openPickerDate === dateStr;
              const dayOfWeek = getDay(day);

              const cellClass = [
                "relative flex flex-col min-h-[64px] rounded-xl border p-1.5 text-left transition-all select-none",
                myStatus === "day"
                  ? "bg-amber-50 border-amber-200"
                  : myStatus === "night"
                  ? "bg-indigo-50 border-indigo-300"
                  : myStatus === "busy"
                  ? "bg-red-50 border-red-200"
                  : myStatus === "free"
                  ? "bg-emerald-50 border-emerald-200"
                  : myStatus === "homer"
                  ? "bg-yellow-50 border-yellow-300"
                  : "bg-white border-slate-200",
                isPast
                  ? "opacity-35 cursor-default"
                  : "hover:shadow-sm cursor-pointer",
                isToday(day) ? "ring-2 ring-brand-400 ring-offset-1" : "",
                "group",
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <div
                  key={dateStr}
                  data-picker
                  role="button"
                  tabIndex={isPast ? -1 : 0}
                  aria-disabled={isPast}
                  onClick={() => {
                    if (isPast) return;
                    setOpenPickerDate(isPickerOpen ? null : dateStr);
                  }}
                  onKeyDown={(e) => {
                    if (!isPast && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      setOpenPickerDate(isPickerOpen ? null : dateStr);
                    }
                    if (e.key === "Escape") setOpenPickerDate(null);
                  }}
                  className={cellClass}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-semibold ${
                        isToday(day) ? "text-brand-600" : "text-slate-600"
                      }`}
                    >
                      {format(day, "d")}
                    </span>
                    <div className="flex items-center gap-0.5">
                      {myStatus === "day" && (
                        <span className="text-xs leading-none">☀️</span>
                      )}
                      {myStatus === "night" && (
                        <span className="text-xs leading-none">🌙</span>
                      )}
                      {myStatus === "free" && (
                        <span className="text-xs leading-none">✅</span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openNote(dateStr);
                        }}
                        title="Add note"
                        className={`text-[10px] leading-none transition-opacity ${
                          hasNote
                            ? "opacity-70"
                            : "opacity-0 group-hover:opacity-40"
                        } hover:!opacity-100`}
                      >
                        📝
                      </button>
                    </div>
                  </div>

                  {/* Homer center image */}
                  {myStatus === "homer" && (
                    <div className="flex-1 min-h-0 py-0.5">
                      <img
                        src="/homer.png"
                        alt="Homer"
                        className="w-full h-full object-cover rounded-lg"
                      />
                    </div>
                  )}

                  {/* Member status dots */}
                  <div className="flex flex-wrap gap-0.5 mt-auto pt-1">
                    {members.map((member) => {
                      const status = dayAvail[member.user_id];
                      if (!status) return null;
                      const dotColor =
                        status === "day"
                          ? "bg-amber-400"
                          : status === "night"
                          ? "bg-indigo-400"
                          : status === "free"
                          ? "bg-emerald-400"
                          : status === "homer"
                          ? "bg-yellow-400"
                          : "bg-red-400";
                      return (
                        <span
                          key={member.user_id}
                          title={`${member.display_name}: ${status}`}
                          className={[
                            "inline-flex items-center justify-center w-4 h-4 rounded-full overflow-hidden",
                            status !== "homer" ? dotColor : "",
                            status !== "homer"
                              ? member.avatar
                                ? "text-[10px]"
                                : "text-[9px] font-bold text-white"
                              : "",
                            member.user_id === currentUserId
                              ? "ring-1 ring-slate-400 ring-offset-[1px]"
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          {status === "homer" ? (
                            <img
                              src="/homer.png"
                              alt="Homer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            member.avatar ?? member.display_name[0]?.toUpperCase()
                          )}
                        </span>
                      );
                    })}
                  </div>

                  {/* Status picker popover */}
                  {isPickerOpen && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className={`absolute z-50 top-full mt-1 bg-white rounded-xl shadow-lg border border-slate-200 p-1 flex gap-0.5 min-w-max ${
                        dayOfWeek >= 4 ? "right-0" : "left-0"
                      }`}
                    >
                      {PICKER_OPTIONS.map(({ status, label, icon }) => (
                        <button
                          key={status}
                          title={label}
                          onClick={() =>
                            setDayStatus(dateStr, myStatus === status ? null : status)
                          }
                          className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm transition-colors ${
                            myStatus === status
                              ? "bg-slate-100 ring-1 ring-slate-300"
                              : "hover:bg-slate-50"
                          }`}
                        >
                          {icon}
                        </button>
                      ))}
                      {/* Homer option */}
                      <button
                        title="Homer"
                        onClick={() =>
                          setDayStatus(dateStr, myStatus === "homer" ? null : "homer")
                        }
                        className={`w-8 h-8 flex items-center justify-center rounded-lg overflow-hidden transition-colors ${
                          myStatus === "homer"
                            ? "ring-2 ring-yellow-400"
                            : "hover:bg-slate-50"
                        }`}
                      >
                        <img
                          src="/homer.png"
                          alt="Homer"
                          className="w-6 h-6 object-cover rounded"
                        />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-slate-400">
          <span className="flex items-center gap-1">☀️ Day</span>
          <span className="flex items-center gap-1">🌙 Night</span>
          <span className="flex items-center gap-1">🔴 Busy</span>
          <span className="flex items-center gap-1">✅ Free</span>
          <span className="flex items-center gap-1">
            <img src="/homer.png" alt="Homer" className="w-3 h-3 rounded-full object-cover" />
            Homer
          </span>
          <span className="flex items-center gap-1">📝 Note</span>
          <span className="ml-auto">Click day to pick · 📝 to add note</span>
        </div>

        {/* Note editor */}
        {activeNoteDate && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-600">
                📝 Note for{" "}
                {format(parseISO(activeNoteDate), "EEE, MMM d")}
              </span>
              <button
                onClick={() => {
                  saveNote(activeNoteDate, noteInput);
                  setActiveNoteDate(null);
                }}
                className="text-xs text-brand-600 hover:text-brand-800 font-medium transition-colors"
              >
                Done
              </button>
            </div>
            <textarea
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              onBlur={() => saveNote(activeNoteDate, noteInput)}
              placeholder="Add a note for the group…"
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-400 resize-none"
              rows={2}
              maxLength={200}
              autoFocus
            />
            {noteInput.length > 150 && (
              <p className="text-xs text-slate-400 text-right mt-1">
                {200 - noteInput.length} left
              </p>
            )}
          </div>
        )}
      </div>

      {/* Everyone's free panel */}
      {(allDayDays.length > 0 || allNightDays.length > 0) && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
          {allDayDays.length > 0 && (
            <div>
              <h3 className="font-semibold text-slate-800 mb-2">
                Everyone free daytime ☀️
              </h3>
              <div className="flex flex-wrap gap-2">
                {allDayDays.map((day) => (
                  <span
                    key={format(day, "yyyy-MM-dd")}
                    className="px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-full text-sm font-medium"
                  >
                    {format(day, "EEE, MMM d")}
                  </span>
                ))}
              </div>
            </div>
          )}
          {allNightDays.length > 0 && (
            <div>
              <h3 className="font-semibold text-slate-800 mb-2">
                Everyone free nighttime 🌙
              </h3>
              <div className="flex flex-wrap gap-2">
                {allNightDays.map((day) => (
                  <span
                    key={format(day, "yyyy-MM-dd")}
                    className="px-3 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-full text-sm font-medium"
                  >
                    {format(day, "EEE, MMM d")}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
