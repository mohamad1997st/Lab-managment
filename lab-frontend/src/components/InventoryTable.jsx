export default function InventoryTable({ data = [] }) {
  if (!Array.isArray(data) || data.length === 0) {
    return <p>No inventory data</p>;
  }
const thStyle = {
  padding: '12px 12px',
  textAlign: 'left',
  fontSize: 13,
  fontWeight: 800,
  borderBottom: '1px solid #e5e7eb',
};

const tdStyle = {
  padding: '12px 12px',
  borderBottom: '1px solid #f1f5f9',
  fontSize: 14,
};

  return (
  <div style={{ width: '100%' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
      <h3 style={{ margin: 0 }}>Inventory Table</h3>
      <span style={{
        padding: '6px 10px',
        borderRadius: 10,
        border: '1px solid #ddd',
        fontSize: 13
      }}>
        Rows: {Array.isArray(data) ? data.length : 0}
      </span>
    </div>

    <div style={{
      border: '1px solid #e5e7eb',
      borderRadius: 12,
      overflow: 'hidden'
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f3f4f6' }}>
            <th style={thStyle}>Species</th>
            <th style={thStyle}>Subculture</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Number of Jars</th>
          </tr>
        </thead>

        <tbody>
          {!Array.isArray(data) || data.length === 0 ? (
            <tr>
              <td colSpan={3} style={{ padding: 16, textAlign: 'center', color: '#6b7280' }}>
                No inventory data found
              </td>
            </tr>
          ) : (
            data.map((row, idx) => (
              <tr key={row.id} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                <td style={tdStyle}>{row.species_name}</td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>{row.subculture_mother_jars}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>
                  {row.number_mother_jar}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>

    <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
      <span style={{
        padding: '6px 10px',
        borderRadius: 10,
        border: '1px solid #ddd',
        fontSize: 13
      }}>
        Total jars: {Array.isArray(data) ? data.reduce((s, r) => s + Number(r.number_mother_jar || 0), 0) : 0}
      </span>
    </div>
  </div>
);

}
