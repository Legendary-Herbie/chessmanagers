import Button from '../shared/common/Button.jsx'
import { useNavigate } from 'react-router-dom'

export default function Landing() {
    const navigate = useNavigate();
    return (
        <div>
            <h1>Landing Page</h1>
            <Button variant="primary" className="" onClick={() => navigate('/auth')}>
                Get Started
            </Button>
        </div>
    )
}