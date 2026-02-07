import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { brandgraphApi, brandgraphKeys, type Brand } from "../contracts/brandgraph.contract";

export function BrandsList() {
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: brandgraphKeys.brands.all(),
    queryFn: brandgraphApi.brands.list
  });

  const onOpen = (brand: Brand) => {
    navigate(`/brands/${brand.id}`);
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Brands</h1>
          <p className="muted">Select a brand to inspect its graph and snapshots.</p>
        </div>
      </header>

      <div className="card">
        {isLoading ? <p>Loading brands…</p> : null}
        {error ? <p className="error">Failed to load brands.</p> : null}
        {data && data.length > 0 ? (
          <ul className="list">
            {data.map((brand) => (
              <li key={brand.id} className="list-item">
                <div>
                  <strong>{brand.name}</strong>
                  {brand.createdAt ? <div className="muted">Created {new Date(brand.createdAt).toLocaleString()}</div> : null}
                </div>
                <button type="button" className="button ghost" onClick={() => onOpen(brand)}>
                  Open
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
