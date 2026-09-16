import React, { Component } from 'react';
import './errorBoundary.css';

export function CardError({ message = 'This section could not be displayed.', onRetry }) {
    return <section className="render-error-card" role="alert">
        <h2>{message}</h2>
        <p>Please try again. If the problem continues, reload the page.</p>
        <button type="button" className="btn-secondary" onClick={onRetry}>Try again</button>
    </section>;
}

export default class ErrorBoundary extends Component {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    componentDidUpdate(previous) {
        if (previous.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false });
    }
    render() {
        if (!this.state.failed) return this.props.children;
        return <CardError message={this.props.message} onRetry={() => this.setState({ failed: false })} />;
    }
}
