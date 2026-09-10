import Button from '../shared/common/Button.jsx';
import { Link } from 'react-router-dom';

export default function NotFound() {
    return (
        <div className="">
            <h1 className="">404 - Page Not Found</h1>
            <p className="">Sorry, the page you're looking for doesn't exist.</p>
            <Link className="text-link" to="/">
                <Button variant='primary' className=''>
                    Go Back Home
                </Button>
            </Link>
        </div>
    );
}