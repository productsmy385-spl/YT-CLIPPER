'use client';

import React, { useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  Share2,
  Youtube,
  Instagram,
  X,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CalendarEvent {
  id: string;
  title: string;
  platform: string;
  status: string;
  scheduled_at: string;
  published_url?: string;
  preview_url?: string;
  account_name?: string;
}

export interface ScheduleCalendarProps {
  events: Record<string, CalendarEvent[]>; // mapped by 'YYYY-MM-DD'
  selectedDate: string | null; // 'YYYY-MM-DD' or null
  onSelectDate: (date: string | null) => void;
  className?: string;
}

export function ScheduleCalendar({
  events,
  selectedDate,
  onSelectDate,
  className,
}: ScheduleCalendarProps) {
  const [currentDate, setCurrentDate] = useState(() => new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Days in current month
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleToday = () => {
    const today = new Date();
    setCurrentDate(today);
    const todayStr = today.toISOString().substring(0, 10);
    onSelectDate(todayStr);
  };

  // Build calendar matrix
  const calendarDays: Array<{
    dateStr: string;
    dayNumber: number;
    isCurrentMonth: boolean;
    isToday: boolean;
    dayEvents: CalendarEvent[];
  }> = [];

  const todayStr = new Date().toISOString().substring(0, 10);

  // Previous month trailing days
  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    const dayNum = daysInPrevMonth - i;
    const prevMonthDate = new Date(year, month - 1, dayNum);
    const dateStr = prevMonthDate.toISOString().substring(0, 10);
    calendarDays.push({
      dateStr,
      dayNumber: dayNum,
      isCurrentMonth: false,
      isToday: dateStr === todayStr,
      dayEvents: events[dateStr] || [],
    });
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    calendarDays.push({
      dateStr: dStr,
      dayNumber: d,
      isCurrentMonth: true,
      isToday: dStr === todayStr,
      dayEvents: events[dStr] || [],
    });
  }

  // Next month leading days to complete full 6 weeks (42 days)
  const remainingCells = 42 - calendarDays.length;
  for (let d = 1; d <= remainingCells; d++) {
    const nextMonthDate = new Date(year, month + 1, d);
    const dateStr = nextMonthDate.toISOString().substring(0, 10);
    calendarDays.push({
      dateStr,
      dayNumber: d,
      isCurrentMonth: false,
      isToday: dateStr === todayStr,
      dayEvents: events[dateStr] || [],
    });
  }

  const selectedEvents = selectedDate ? events[selectedDate] || [] : [];

  return (
    <div className={cn('vice-card p-4 sm:p-5 space-y-4 border border-border bg-card text-foreground', className)}>
      {/* Calendar Header with Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-extrabold text-base text-foreground flex items-center gap-2">
              {monthNames[month]} {year}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Click any date to filter scheduled and uploaded videos
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handleToday}
            className="px-2.5 py-1 text-xs font-bold rounded-lg border border-border bg-background hover:bg-muted text-foreground transition-colors"
          >
            Today
          </button>
          <div className="flex items-center border border-border rounded-lg bg-background overflow-hidden">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleNextMonth}
              className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {selectedDate && (
            <button
              onClick={() => onSelectDate(null)}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-muted text-muted-foreground hover:text-foreground border border-border transition-colors"
              title="Clear date filter"
            >
              <X className="w-3.5 h-3.5" />
              <span>Clear Date</span>
            </button>
          )}
        </div>
      </div>

      {/* Selected Date Filter Banner */}
      {selectedDate && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-primary/10 border border-primary/30 text-xs">
          <div className="flex items-center gap-2 text-foreground font-semibold">
            <Sparkles className="w-4 h-4 text-primary" />
            <span>
              Filtering by Date: <strong className="text-primary font-bold">{selectedDate}</strong> (
              {selectedEvents.length} video{selectedEvents.length === 1 ? '' : 's'} scheduled/uploaded)
            </span>
          </div>
          <button
            onClick={() => onSelectDate(null)}
            className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
          >
            Show All Videos &rarr;
          </button>
        </div>
      )}

      {/* Day of Week Headers */}
      <div className="grid grid-cols-7 gap-1 text-center">
        {daysOfWeek.map((day) => (
          <div
            key={day}
            className="py-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {calendarDays.map((cell) => {
          const isSelected = selectedDate === cell.dateStr;
          const hasEvents = cell.dayEvents.length > 0;
          const publishedCount = cell.dayEvents.filter((e) => e.status === 'PUBLISHED').length;
          const scheduledCount = cell.dayEvents.filter((e) => e.status === 'SCHEDULED' || e.status === 'PROCESSING').length;

          return (
            <button
              key={cell.dateStr}
              type="button"
              onClick={() => onSelectDate(isSelected ? null : cell.dateStr)}
              className={cn(
                'min-h-[58px] sm:min-h-[68px] p-1 sm:p-1.5 rounded-xl border text-left flex flex-col justify-between transition-all relative group',
                cell.isCurrentMonth
                  ? 'bg-background hover:border-primary/50'
                  : 'bg-muted/30 opacity-40 hover:opacity-75',
                cell.isToday && 'ring-1 ring-primary/60 border-primary',
                isSelected
                  ? 'bg-primary/15 border-primary shadow-sm font-bold'
                  : 'border-border'
              )}
            >
              {/* Day Number */}
              <div className="flex items-center justify-between w-full">
                <span
                  className={cn(
                    'text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center',
                    cell.isToday
                      ? 'bg-primary text-[#194350]'
                      : isSelected
                      ? 'text-primary'
                      : 'text-foreground'
                  )}
                >
                  {cell.dayNumber}
                </span>

                {hasEvents && (
                  <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded-full bg-primary/20 text-primary border border-primary/30">
                    {cell.dayEvents.length}
                  </span>
                )}
              </div>

              {/* Event indicators */}
              <div className="space-y-0.5 mt-1 w-full overflow-hidden">
                {publishedCount > 0 && (
                  <div className="flex items-center gap-1 text-[9px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/15 rounded px-1 py-0.5 truncate border border-emerald-500/20">
                    <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />
                    <span className="truncate">{publishedCount} Published</span>
                  </div>
                )}
                {scheduledCount > 0 && (
                  <div className="flex items-center gap-1 text-[9px] font-bold text-primary bg-primary/15 rounded px-1 py-0.5 truncate border border-primary/20">
                    <Clock className="w-2.5 h-2.5 shrink-0" />
                    <span className="truncate">{scheduledCount} Sched</span>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
