import { ChevronDown, User } from "lucide-react";
import { useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { GlassCard } from "@/components/glass-card";

type SettingsPageProps = {
  role: "teacher" | "student";
};

type ToggleProps = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

function Toggle({ label, checked, onChange }: ToggleProps) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-[1.02rem] text-slate-800 dark:text-slate-200">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 ${
          checked ? "bg-sky-600" : "bg-slate-300 dark:bg-slate-600"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

export function SettingsPage({ role }: SettingsPageProps) {
  const [allowEmail, setAllowEmail] = useState(true);
  const [commentOnPosts, setCommentOnPosts] = useState(true);
  const [commentMentions, setCommentMentions] = useState(true);
  const [privateComments, setPrivateComments] = useState(true);

  // Student specific
  const [workFromTeachers, setWorkFromTeachers] = useState(true);
  const [returnedWork, setReturnedWork] = useState(true);
  const [studentInvitations, setStudentInvitations] = useState(true);
  const [dueDateReminders, setDueDateReminders] = useState(true);

  // Teacher specific
  const [lateSubmissions, setLateSubmissions] = useState(true);
  const [resubmissions, setResubmissions] = useState(true);
  const [teacherInvitations, setTeacherInvitations] = useState(true);
  const [scheduledPosts, setScheduledPosts] = useState(true);

  const [classNotificationsExpanded, setClassNotificationsExpanded] = useState(false);
  const [showDisplayName, setShowDisplayName] = useState(true);

  return (
    <GlassCard className="mx-auto max-w-4xl p-0 overflow-hidden bg-white/70 dark:bg-slate-900/60 shadow-glass">
      <div className="flex items-center justify-between border-b border-slate-200/50 bg-white/50 px-8 py-5 dark:border-slate-700/50 dark:bg-slate-800/50">
        <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">Settings</h1>
        <ThemeToggle />
      </div>

      <div className="p-8 space-y-8">
        {/* Profile Section */}
        <div className="rounded-xl border border-slate-200/60 bg-white/40 p-6 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/40">
          <h2 className="mb-6 text-xl font-medium text-slate-800 dark:text-slate-100">Profile</h2>
          
          <div className="space-y-6">
            <div>
              <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">Profile picture</p>
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sky-600 text-xl font-medium text-white">
                  R
                </div>
                <button className="text-[1.02rem] font-medium text-sky-600 hover:underline dark:text-sky-400">
                  Change
                </button>
              </div>
            </div>

            <div>
              <p className="mb-1 text-sm text-slate-600 dark:text-slate-400">Account settings</p>
              <p className="text-[1.02rem] text-slate-800 dark:text-slate-200">
                Change your password and security options, and access other Google services.{" "}
                <button className="font-medium text-sky-600 hover:underline dark:text-sky-400">Manage</button>
              </p>
            </div>

            <div>
              <p className="mb-1 text-sm text-slate-600 dark:text-slate-400">Change name</p>
              <p className="text-[1.02rem] text-slate-800 dark:text-slate-200">
                To change your name, ask your admin.{" "}
                <button className="font-medium text-sky-600 hover:underline dark:text-sky-400">Learn more</button>
              </p>
            </div>
          </div>
        </div>

        {/* Notifications Section */}
        <div className="rounded-xl border border-slate-200/60 bg-white/40 p-6 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/40">
          <h2 className="mb-6 text-xl font-medium text-slate-800 dark:text-slate-100">Notifications</h2>

          <div className="space-y-6">
            <div className="border-b border-slate-200/50 pb-6 dark:border-slate-700/50">
              <h3 className="mb-1 text-lg font-medium text-slate-800 dark:text-slate-200">Email</h3>
              <p className="mb-4 text-[0.95rem] text-slate-600 dark:text-slate-400">
                These settings apply to the notifications you get by email.{" "}
                <button className="text-sky-600 hover:underline dark:text-sky-400">Learn more</button>
              </p>
              <Toggle label="Allow email notifications" checked={allowEmail} onChange={setAllowEmail} />
            </div>

            {allowEmail && (
              <>
                <div className="border-b border-slate-200/50 pb-6 dark:border-slate-700/50">
                  <h3 className="mb-3 text-lg font-medium text-slate-800 dark:text-slate-200">Comments</h3>
                  <div className="space-y-1">
                    <Toggle label="Comments on your posts" checked={commentOnPosts} onChange={setCommentOnPosts} />
                    <Toggle label="Comments that mention you" checked={commentMentions} onChange={setCommentMentions} />
                    <Toggle label="Private comments on work" checked={privateComments} onChange={setPrivateComments} />
                  </div>
                </div>

                <div className="border-b border-slate-200/50 pb-6 dark:border-slate-700/50">
                  <h3 className="mb-3 text-lg font-medium text-slate-800 dark:text-slate-200">
                    {role === "student" ? "Classes you're enrolled in" : "Classes you teach"}
                  </h3>
                  <div className="space-y-1">
                    {role === "student" ? (
                      <>
                        <Toggle label="Work and other posts from teachers" checked={workFromTeachers} onChange={setWorkFromTeachers} />
                        <Toggle label="Returned work and grades from your teachers" checked={returnedWork} onChange={setReturnedWork} />
                        <Toggle label="Invitations to join classes as a student" checked={studentInvitations} onChange={setStudentInvitations} />
                        <Toggle label="Due-date reminders for your work" checked={dueDateReminders} onChange={setDueDateReminders} />
                      </>
                    ) : (
                      <>
                        <Toggle label="Late submissions of student work" checked={lateSubmissions} onChange={setLateSubmissions} />
                        <Toggle label="Resubmissions of student work" checked={resubmissions} onChange={setResubmissions} />
                        <Toggle label="Invitations to co-teach classes" checked={teacherInvitations} onChange={setTeacherInvitations} />
                        <Toggle label="Scheduled post published or failed" checked={scheduledPosts} onChange={setScheduledPosts} />
                      </>
                    )}
                  </div>
                </div>

                <div>
                  <button
                    onClick={() => setClassNotificationsExpanded(!classNotificationsExpanded)}
                    className="flex w-full items-center justify-between py-2 text-left"
                  >
                    <div>
                      <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200">Class notifications</h3>
                      <p className="text-[0.95rem] text-slate-600 dark:text-slate-400">
                        These settings apply to both your email and device notifications for each class
                      </p>
                    </div>
                    <ChevronDown
                      className={`h-5 w-5 text-slate-500 transition-transform dark:text-slate-400 ${
                        classNotificationsExpanded ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  {classNotificationsExpanded && (
                    <div className="mt-4 rounded-lg bg-slate-50 p-4 dark:bg-slate-800/80">
                      <p className="text-sm text-slate-600 dark:text-slate-400 text-center">
                        No classes available or class notifications are managed per-class.
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Homepage Section */}
        <div className="rounded-xl border border-slate-200/60 bg-white/40 p-6 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/40">
          <h2 className="mb-6 text-xl font-medium text-slate-800 dark:text-slate-100">Homepage</h2>
          
          <div>
            <p className="mb-2 text-sm text-slate-600 dark:text-slate-400">Display name</p>
            <Toggle label="Show your name on the homepage" checked={showDisplayName} onChange={setShowDisplayName} />
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
