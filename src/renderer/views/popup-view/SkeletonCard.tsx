export function SkeletonCard() {
    return (
        <div className="card">
            <div className="card-head">
                <div className="skel lbl" />
            </div>
            <div className="skeleton-bars">
                <div className="skel-row">
                    <div className="skel lbl" />
                    <div className="skel" />
                </div>
                <div className="skel-row">
                    <div className="skel lbl" />
                    <div className="skel" />
                </div>
            </div>
        </div>
    );
}
