export function canRemoveClubMember(member, currentUserId) {
    return Boolean(
        member
        && member.role !== 'owner'
        && member.userId !== currentUserId
    );
}
