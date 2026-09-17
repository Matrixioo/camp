import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, addMember, fetchMembers, removeMember } from '../api';
import type { Membership, Role } from '../types';
import { flattenErrors } from '../errors';
import { useBodyScrollLock } from '../useBodyScrollLock';

interface Props {
  hotel: { id: number; name: string };
  role: Role;
  onClose: () => void;
}

export function MembersModal({ hotel, role, onClose }: Props) {
  useBodyScrollLock();

  const [members, setMembers] = useState<Membership[]>([]);
  const [email, setEmail] = useState('');
  const [newRole, setNewRole] = useState<Role>('staff');
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const grantableRoles: Role[] = role === 'owner' ? ['admin', 'staff'] : ['staff'];

  useEffect(() => {
    fetchMembers(hotel.id).then(setMembers).catch(() => {});
  }, [hotel.id]);

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    setErrors([]);
    setSubmitting(true);
    try {
      const membership = await addMember(hotel.id, email.trim(), newRole);
      setMembers((prev) => [...prev.filter((m) => m.user.id !== membership.user.id), membership]);
      setEmail('');
    } catch (err) {
      setErrors(err instanceof ApiError ? flattenErrors(err.errors) : ['Could not add that member.']);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(membership: Membership) {
    await removeMember(membership.id);
    setMembers((prev) => prev.filter((m) => m.id !== membership.id));
  }

  function canRemove(membership: Membership): boolean {
    if (membership.role === 'owner') return false;
    if (membership.role === 'admin') return role === 'owner';
    return true;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal members-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Team — {hotel.name}</h3>

        <ul className="members-list">
          {members.map((m) => (
            <li key={m.id} className="member-row">
              <div className="member-info">
                <strong>{m.user.username}</strong>
                <span className="muted">{m.user.email}</span>
              </div>
              <span className={`role-badge role-${m.role}`}>{m.role}</span>
              {canRemove(m) && (
                <button type="button" className="danger" onClick={() => handleRemove(m)}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>

        <form className="add-member-row" onSubmit={handleAdd}>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Role
            <select value={newRole} onChange={(e) => setNewRole(e.target.value as Role)}>
              {grantableRoles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={submitting}>
            Add
          </button>
        </form>

        {errors.length > 0 && (
          <ul className="error-list">
            {errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        )}

        <div className="modal-actions">
          <div className="spacer" />
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
