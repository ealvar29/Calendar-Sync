export interface Group {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
  created_at: string;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  role: "host" | "member";
  joined_at: string;
}

export interface Profile {
  id: string;
  display_name: string | null;
}

export type AvailabilityStatus = "free" | "busy";

export interface Availability {
  id: string;
  user_id: string;
  group_id: string;
  date: string;
  status: AvailabilityStatus;
}

export interface MemberWithProfile {
  user_id: string;
  role: "host" | "member";
  display_name: string;
}
