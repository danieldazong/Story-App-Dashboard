"use client";

import { useState } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  SETTINGS_TEAM,
  TEAM_ROLE_OPTIONS,
  type TeamMember,
  type TeamRole,
} from "@/data/settings-defaults";

function roleLabel(role: TeamRole): string {
  return TEAM_ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role;
}

export function TeamCard() {
  const [members, setMembers] = useState<TeamMember[]>([...SETTINGS_TEAM]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("editor");

  function removeMember(id: string) {
    setMembers((current) => current.filter((member) => member.id !== id));
  }

  function handleInviteOpenChange(next: boolean) {
    setInviteOpen(next);
    if (!next) {
      setInviteEmail("");
      setInviteRole("editor");
    }
  }

  return (
    <div className="card flex flex-col gap-4 p-6">
      <div>
        <h2 className="card__header-title">Team</h2>
        <p className="card__sub-line">
          Operators with access to publish and edit catalog contents.
        </p>
      </div>

      {members.length === 0 ? (
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
                  </TableCell>
                  <TableCell className="font-mono text-mono text-muted">
                    {member.email}
                  </TableCell>
                  <TableCell>
                    <span className="status-pill status-pill--ok">
                      {roleLabel(member.role)}
                    </span>
                  </TableCell>
                  <TableCell className="px-0 text-right">
                    <button
                      type="button"
                      onClick={() => removeMember(member.id)}
                      aria-label={`Remove ${member.name}`}
                      className="rounded-sm text-helper text-muted underline transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      Remove
                    </button>
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
              They receive access to publish and edit catalog contents.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="field-group">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="operator@novelnow.internal"
                autoComplete="off"
              />
            </div>

            <div className="field-group">
              <Label htmlFor="invite-role">Role</Label>
              <Select
                value={inviteRole}
                onValueChange={(value) => setInviteRole(value as TeamRole)}
              >
                <SelectTrigger id="invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEAM_ROLE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="muted" onClick={() => handleInviteOpenChange(false)}>
              Cancel
            </Button>
            {/* No invite path exists yet (Clerk lands in prompt 11), so this
                closes without effect rather than faking a pending member. */}
            <Button
              variant="outline"
              onClick={() => handleInviteOpenChange(false)}
            >
              Send invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
