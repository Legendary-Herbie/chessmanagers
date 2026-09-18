import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { clubApi } from '../../clubs/api/clubApi.js';

export default function PublicBreadcrumbs({ clubId, name }) {
    const [clubName, setClubName] = useState('Club');
    useEffect(() => {
        const controller = new AbortController();
        setClubName('Club');
        clubApi.fetchPresentation(clubId, { signal: controller.signal }).then(club => {
            if (!controller.signal.aborted) setClubName(club.name);
        }).catch(() => {});
        return () => controller.abort();
    }, [clubId]);
    return <nav aria-label="Breadcrumbs"><ol className="public-breadcrumbs">
        <li><Link className="text-link" to="/clubs">Public Clubs</Link></li>
        <li><Link className="text-link" to={`/clubs/${clubId}`}>{clubName}</Link></li>
        <li aria-current="page">{name}</li>
    </ol></nav>;
}
