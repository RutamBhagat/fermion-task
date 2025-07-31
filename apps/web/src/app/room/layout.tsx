export default function RoomLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return <div className="fixed inset-0 z-50">{children}</div>;
}
