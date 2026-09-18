"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  inviteTeamMember,
  listTeamMembers,
  removeTeamMember,
  revokeTeamInvitation,
  type TeamMemberRecord,
} from "@/app/actions/team";

/**
 * The real team, from Clerk.
 *
 * This card rendered three invented people from a `SETTINGS_TEAM` fixture until
 * 2026-09-18, with a `Remove` link that mutated local state and a `Send invite`
 * button whose own comment admitted it did nothing. Every row was fiction.
 *
 * The list arrives as a prop, read server-side by the Settings page.
 *
 * An earlier revision fetched it here in a `useEffect` on mount, to avoid
 * threading a prop through SettingsScreen and SettingsForm — neither of which
 * has anything to do with team management. The React Compiler's
 * `react-hooks/set-state-in-effect` rule correctly rejected it: an effect whose
 * only job is to setState is the cascading-render pattern, and the same rule
 * drove the `useSyncExternalStore` decision recorded in AGENTS.md. Server-side
 * is also simply better here — the data arrives with the page instead of after
 * a round trip, so there is no loading state to render at all.
 *
 * `refresh()` below still calls the action, but only from event handlers after
 * a mutation, where setState is exactly what is supposed to happen.
 */

/**
 * Only `admin` is offered, and that is deliberate.
 *
 * Every gate in this app is `metadata.role === "admin"` — `requireAdmin()`
 * redirects anything else and RLS gates on `is_admin()`. The old dropdown also
 * offered Editor and Audio Master, so inviting someone as an Editor would have
 * created a user who could not sign in at all: an invitation granting access
 * the app refuses. A role select with one option is not a choice, so the role
 * is stated rather than picked. Bring the dropdown back when the roles have
 * behaviour behind them.
 */
export function TeamCard({
  initialMembers,
  loadError: initialLoadError = null,
}: {
  initialMembers: TeamMemberRecord[];
  /** Set when the server-side read failed, so the card can say so. */
  loadError?: string | null;
}) {
  const [members, setMembers] = useState<TeamMemberRecord[]>(initialMembers);
  const [loadError, setLoadError] = useState<string | null>(initialLoadError);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviting, startInviting] = useTransition();

  const [pendingRemoval, setPendingRemoval] =
    useState<TeamMemberRecord | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removing, startRemoving] = useTransition();

  /** Re-reads the roster after a mutation. Event handlers only, never an effect. */
  async function refresh() {
    const result = await listTeamMembers();
    if (!result.ok) {
      setLoadError(result.formError);
      return;
    }
    setLoadError(null);
    setMembers(result.data);
  }

  function handleInviteOpenChange(next: boolean) {
    if (inviting) return;
    setInviteOpen(next);
    if (!next) {
      setInviteEmail("");
      setInviteError(null);
    }
  }

  function handleInvite() {
    setInviteError(null);
    startInviting(async () => {
      const result = await inviteTeamMember({ email: inviteEmail });

      if (!result.ok) {
        setInviteError(result.fieldErrors?.email ?? result.formError);
        return;
      }

      toast.success(`Invitation sent to ${result.data.email}.`);
      setInviteOpen(false);
      setInviteEmail("");
      await refresh();
    });
  }

  function handleRemove() {
    const target = pendingRemoval;
    if (!target) return;

    setRemoveError(null);
    startRemoving(async () => {
      const result =
        target.status === "pending"
          ? await revokeTeamInvitation(target.id)
          : await removeTeamMember(target.id);

      if (!result.ok) {
        setRemoveError(result.formError);
        return;
      }

      toast.success(
        target.status === "pending"
          ? `Invitation to ${target.email} cancelled.`
          : `${target.email}'s account was deleted.`,
      );
      setPendingRemoval(null);
      await refresh();
    });
  }

  return (
    <div className="card flex flex-col gap-4 p-6">
      <div>
        <h2 className="card__header-title">Team</h2>
        <p className="card__sub-line">
          Operators with access to publish and edit catalog contents.
        </p>
      </div>

      {loadError ? (
        <div className="flex flex-col gap-2">
          <p className="field-group__helper field-group__helper--error">
            {loadError}
          </p>
          <div>
            <Button variant="outline" size="sm" onClick={() => void refresh()}>
              Try again
            </Button>
          </div>
        </div>
      ) : members.length === 0 ? (
        <p className="text-helper text-muted">
          No team members yet. Invite an operator to give them access.
        </p>
      ) : (
        <div className="table-wrapper">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-0">Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="px-0 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="px-0 text-body text-text">
                    {member.name}
                    {member.isSelf && (
                      <span className="text-helper text-muted"> (you)</span>
                    )}
                  </TableCell>
                  {/*
                    Inter at text-helper (12px), NOT mono — a deliberate
                    exception to the "identifiers render in mono" habit used
                    elsewhere in this app.

                    Two passes got here. The email was text-mono (13px) beside a
                    text-body (14px) name: 1px smaller nominally, but JetBrains
                    Mono is ~15-20% wider per character than Inter, so it
                    optically outweighed the name and the row read email-first.
                    Dropping to 12px helped and still was not enough, because
                    the width came from the FACE, not the size — and 12px is
                    already the smallest token in the type system, so there was
                    nothing left to take.

                    Mono earns its place where characters must align or be read
                    one at a time: file names, storage paths, chapter numbers,
                    durations, digests. An email in a roster is read as a whole
                    word and never compared column-wise, so mono was buying
                    width with no benefit.
                  */}
                  <TableCell className="text-helper text-muted">
                    {member.email}
                  </TableCell>
                  <TableCell>
                    {/*
                      An invited operator has no role until they accept, and a
                      Clerk user with no role cannot sign in. Both are real
                      states and both must be visible — an "Admin" pill over
                      either would be the same fiction this card just lost.
                    */}
                    {member.status === "pending" ? (
                      <span className="status-pill status-pill--warn">
                        Invited
                      </span>
                    ) : member.role === "admin" ? (
                      <span className="status-pill status-pill--ok">Admin</span>
                    ) : (
                      <span className="status-pill status-pill--destructive">
                        No access
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="px-0 text-right">
                    {member.isSelf ? (
                      // Removing your own access would lock you out of the
                      // screen you are standing on. The server refuses it too.
                      <span className="text-helper text-muted">—</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setRemoveError(null);
                          setPendingRemoval(member);
                        }}
                        aria-label={
                          member.status === "pending"
                            ? `Cancel invitation to ${member.email}`
                            : `Delete ${member.name}'s account`
                        }
                        className="rounded-sm text-helper text-muted underline transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        {member.status === "pending" ? "Cancel" : "Delete"}
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div>
        <Button
          type="button"
          variant="muted"
          size="sm"
          onClick={() => setInviteOpen(true)}
        >
          Invite member
        </Button>
      </div>

      <Dialog open={inviteOpen} onOpenChange={handleInviteOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite member</DialogTitle>
            <DialogDescription>
              They receive an email invitation. Accepting it creates their
              account with admin access.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="field-group">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(event) => {
                  setInviteEmail(event.target.value);
                  setInviteError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && inviteEmail.trim() !== "") {
                    event.preventDefault();
                    handleInvite();
                  }
                }}
                placeholder="operator@example.com"
                autoComplete="off"
                disabled={inviting}
              />
              {inviteError && (
                <p className="field-group__helper field-group__helper--error">
                  {inviteError}
                </p>
              )}
            </div>

            <div className="field-group">
              <span className="field-group__label">Role</span>
              <p className="text-body text-text">Admin</p>
              <p className="field-group__helper">
                Admin is the only role this dashboard grants today. Everyone
                with access can publish and edit the whole catalog.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="muted"
              disabled={inviting}
              onClick={() => handleInviteOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={inviting || inviteEmail.trim() === ""}
              onClick={handleInvite}
            >
              {inviting ? "Sending…" : "Send invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => {
          if (removing) return;
          if (!open) {
            setPendingRemoval(null);
            setRemoveError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingRemoval?.status === "pending"
                ? "Cancel this invitation?"
                : "Delete this account?"}
            </DialogTitle>
            <DialogDescription>
              {pendingRemoval?.status === "pending"
                ? `The invitation to ${pendingRemoval?.email} will be cancelled. They can be invited again later.`
                : /*
                    Deliberately not "remove access" — that phrasing described
                    the OLD behaviour (clear the role, keep the account), and
                    kept it after the action underneath changed to a real
                    delete. This is the one line that must never drift from
                    what removeTeamMember() actually does: an irreversible
                    account deletion has to read as one.
                  */
                  `${pendingRemoval?.email}'s Clerk account will be permanently deleted — not just their access. This can't be undone. Adding them back later means sending a fresh invitation.`}
            </DialogDescription>
          </DialogHeader>
          {removeError && (
            <p className="field-group__helper field-group__helper--error">
              {removeError}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="muted"
              disabled={removing}
              onClick={() => setPendingRemoval(null)}
            >
              {pendingRemoval?.status === "pending" ? "Keep invitation" : "Keep account"}
            </Button>
            <Button
              variant="destructive"
              disabled={removing}
              onClick={handleRemove}
            >
              {removing
                ? pendingRemoval?.status === "pending"
                  ? "Cancelling…"
                  : "Deleting…"
                : pendingRemoval?.status === "pending"
                  ? "Cancel invitation"
                  : "Delete account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
