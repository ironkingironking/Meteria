"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface Building {
  id: string;
  name: string;
}

interface BillingPeriod {
  id: string;
  name: string;
  building: { id: string; name: string };
  periodStart: string;
  periodEnd: string;
  periodType: string;
  fiscalYear: number | null;
  status: string;
}

interface InvoiceDraft {
  id: string;
  building: { name: string };
  unit: { name: string } | null;
  billingPeriod: { name: string };
  totalAmount: number;
  currency: string;
  status: string;
  warningFlags: string[];
}

interface Tariff {
  id: string;
  name: string;
  meterType: string;
  pricingModel: string;
  pricePerUnit: number | null;
  monthlyBaseFee: number | null;
  currency: string;
  taxProfileId: string | null;
}

interface TaxProfile {
  id: string;
  name: string;
  countryCode: string;
  taxHandlingMode: string;
  vatRate: number | null;
  isDefault: boolean;
}

interface AllocationKey {
  id: string;
  name: string;
  method: string;
  isDefault: boolean;
  building: { name: string } | null;
}

interface OperatingCostComponent {
  id: string;
  name: string;
  componentType: string;
  fixedAmount: number | null;
  variableRate: number | null;
  currency: string;
}

interface BillingChangeLogEntry {
  id: string;
  sourceModule: string;
  action: string;
  entityType: string;
  reason: string | null;
  createdAt: string;
  user: { email: string } | null;
}

export default function BillingPage() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [periods, setPeriods] = useState<BillingPeriod[]>([]);
  const [drafts, setDrafts] = useState<InvoiceDraft[]>([]);
  const [tariffs, setTariffs] = useState<Tariff[]>([]);
  const [taxProfiles, setTaxProfiles] = useState<TaxProfile[]>([]);
  const [allocationKeys, setAllocationKeys] = useState<AllocationKey[]>([]);
  const [operatingCostComponents, setOperatingCostComponents] = useState<OperatingCostComponent[]>([]);
  const [billingChangeLogs, setBillingChangeLogs] = useState<BillingChangeLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const [buildingResult, periodResult, draftResult, tariffResult, taxProfileResult, allocationKeyResult, operatingCostResult, billingChangeLogResult] = await Promise.all([
        apiFetch<{ data: Building[] }>("/api/v1/buildings"),
        apiFetch<{ data: BillingPeriod[] }>("/api/v1/billing-periods"),
        apiFetch<{ data: InvoiceDraft[] }>("/api/v1/invoice-drafts"),
        apiFetch<{ data: Tariff[] }>("/api/v1/tariffs"),
        apiFetch<{ data: TaxProfile[] }>("/api/v1/tax-profiles"),
        apiFetch<{ data: AllocationKey[] }>("/api/v1/allocation-keys"),
        apiFetch<{ data: OperatingCostComponent[] }>("/api/v1/operating-cost-components"),
        apiFetch<{ data: BillingChangeLogEntry[] }>("/api/v1/billing-change-log?limit=50")
      ]);

      setBuildings(buildingResult.data);
      setPeriods(periodResult.data);
      setDrafts(draftResult.data);
      setTariffs(tariffResult.data);
      setTaxProfiles(taxProfileResult.data);
      setAllocationKeys(allocationKeyResult.data);
      setOperatingCostComponents(operatingCostResult.data);
      setBillingChangeLogs(billingChangeLogResult.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load billing data");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onCreatePeriod = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    try {
      await apiFetch("/api/v1/billing-periods", {
        method: "POST",
        body: JSON.stringify({
          building_id: String(form.get("building_id") || ""),
          name: String(form.get("name") || ""),
          period_start: String(form.get("period_start") || ""),
          period_end: String(form.get("period_end") || ""),
          period_type: String(form.get("period_type") || "custom"),
          fiscal_year: Number(form.get("fiscal_year") || "0") || undefined
        })
      });
      event.currentTarget.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create billing period");
    }
  };

  const onCreateTariff = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    try {
      await apiFetch("/api/v1/tariffs", {
        method: "POST",
        body: JSON.stringify({
          name: String(form.get("name") || ""),
          meter_type: String(form.get("meter_type") || "heat"),
          valid_from: String(form.get("valid_from") || new Date().toISOString()),
          pricing_model: String(form.get("pricing_model") || "flat_per_unit"),
          price_per_unit: Number(form.get("price_per_unit") || "0"),
          monthly_base_fee: Number(form.get("monthly_base_fee") || "0"),
          currency: String(form.get("currency") || "CHF"),
          tax_profile_id: String(form.get("tax_profile_id") || "") || undefined
        })
      });
      event.currentTarget.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create tariff");
    }
  };

  const onCreateTaxProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    try {
      await apiFetch("/api/v1/tax-profiles", {
        method: "POST",
        body: JSON.stringify({
          name: String(form.get("name") || ""),
          country_code: String(form.get("country_code") || "CH"),
          tax_handling_mode: String(form.get("tax_handling_mode") || "exclusive"),
          vat_rate: Number(form.get("vat_rate") || "0"),
          valid_from: String(form.get("valid_from") || new Date().toISOString()),
          is_default: form.get("is_default") === "on"
        })
      });
      event.currentTarget.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create tax profile");
    }
  };

  const onCreateAllocationKey = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const buildingIdRaw = String(form.get("allocation_building_id") || "");
    const shareValue = Number(form.get("share_value") || "1");

    try {
      await apiFetch("/api/v1/allocation-keys", {
        method: "POST",
        body: JSON.stringify({
          building_id: buildingIdRaw || null,
          name: String(form.get("allocation_name") || ""),
          method: String(form.get("method") || "custom_share"),
          valid_from: String(form.get("allocation_valid_from") || new Date().toISOString()),
          is_default: form.get("allocation_is_default") === "on",
          entries: [
            {
              unit_id: null,
              label: "building_default",
              share_value: shareValue
            }
          ]
        })
      });
      event.currentTarget.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create allocation key");
    }
  };

  const onCreateOperatingCostComponent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    try {
      await apiFetch("/api/v1/operating-cost-components", {
        method: "POST",
        body: JSON.stringify({
          building_id: String(form.get("component_building_id") || "") || undefined,
          name: String(form.get("component_name") || ""),
          component_type: String(form.get("component_type") || "fixed"),
          fixed_amount: Number(form.get("fixed_amount") || "0") || undefined,
          variable_rate: Number(form.get("variable_rate") || "0") || undefined,
          currency: String(form.get("component_currency") || "CHF"),
          allocation_key_id: String(form.get("allocation_key_id") || "") || undefined,
          tax_profile_id: String(form.get("component_tax_profile_id") || "") || undefined,
          valid_from: String(form.get("component_valid_from") || new Date().toISOString())
        })
      });
      event.currentTarget.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create operating cost component");
    }
  };

  const onGenerateDrafts = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    try {
      await apiFetch("/api/v1/billing/generate-drafts", {
        method: "POST",
        body: JSON.stringify({
          building_id: String(form.get("generate_building_id") || ""),
          billing_period_id: String(form.get("billing_period_id") || ""),
          tax_rate: Number(form.get("tax_rate") || "0")
        })
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate drafts");
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Billing</h2>
          <p className="muted">Tariffs, periods, and invoice draft generation</p>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <section className="grid two" style={{ marginBottom: 14 }}>
        <div className="panel">
          <h3>Create billing period</h3>
          <form onSubmit={onCreatePeriod}>
            <div className="form-row">
              <select name="building_id" required>
                <option value="">Building</option>
                {buildings.map((building) => (
                  <option key={building.id} value={building.id}>
                    {building.name}
                  </option>
                ))}
              </select>
              <input className="input" name="name" placeholder="2026 Q1" required />
            </div>
            <div className="form-row">
              <input className="input" name="period_start" type="datetime-local" required />
              <input className="input" name="period_end" type="datetime-local" required />
            </div>
            <div className="form-row">
              <select name="period_type" defaultValue="custom">
                <option value="custom">custom</option>
                <option value="monthly">monthly</option>
                <option value="quarterly">quarterly</option>
                <option value="annual">annual</option>
              </select>
              <input className="input" name="fiscal_year" placeholder="Fiscal year (optional)" />
            </div>
            <button type="submit">Create period</button>
          </form>
        </div>

        <div className="panel">
          <h3>Create tariff</h3>
          <form onSubmit={onCreateTariff}>
            <div className="form-row">
              <input className="input" name="name" placeholder="Heat tariff 2026" required />
              <select name="meter_type" defaultValue="heat">
                <option value="electricity">electricity</option>
                <option value="water_cold">water_cold</option>
                <option value="water_hot">water_hot</option>
                <option value="heat">heat</option>
                <option value="gas">gas</option>
              </select>
            </div>
            <div className="form-row">
              <select name="pricing_model" defaultValue="flat_per_unit">
                <option value="flat_per_unit">flat_per_unit</option>
                <option value="monthly_fixed_plus_usage">monthly_fixed_plus_usage</option>
                <option value="tiered">tiered</option>
              </select>
              <input className="input" name="valid_from" type="datetime-local" required />
            </div>
            <div className="form-row">
              <input className="input" name="price_per_unit" defaultValue="0.18" />
              <input className="input" name="monthly_base_fee" defaultValue="0" />
            </div>
            <div className="form-row">
              <input className="input" name="currency" defaultValue="CHF" maxLength={3} />
              <select name="tax_profile_id" defaultValue="">
                <option value="">No tax profile</option>
                {taxProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name} ({profile.taxHandlingMode})
                  </option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <button type="submit">Create tariff</button>
            </div>
          </form>
        </div>
      </section>

      <section className="grid two" style={{ marginBottom: 14 }}>
        <div className="panel">
          <h3>Tax profiles</h3>
          <form onSubmit={onCreateTaxProfile}>
            <div className="form-row">
              <input className="input" name="name" placeholder="Swiss VAT 2026" required />
              <input className="input" name="country_code" defaultValue="CH" maxLength={2} />
            </div>
            <div className="form-row">
              <select name="tax_handling_mode" defaultValue="exclusive">
                <option value="exclusive">exclusive</option>
                <option value="inclusive">inclusive</option>
                <option value="exempt">exempt</option>
                <option value="reverse_charge">reverse_charge</option>
              </select>
              <input className="input" name="vat_rate" defaultValue="0.077" />
            </div>
            <div className="form-row">
              <input className="input" name="valid_from" type="datetime-local" required />
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" name="is_default" />
                Default
              </label>
            </div>
            <button type="submit">Create tax profile</button>
          </form>
        </div>

        <div className="panel">
          <h3>Allocation keys</h3>
          <form onSubmit={onCreateAllocationKey}>
            <div className="form-row">
              <input className="input" name="allocation_name" placeholder="Heating allocation 2026" required />
              <select name="allocation_building_id" defaultValue="">
                <option value="">All buildings</option>
                {buildings.map((building) => (
                  <option key={building.id} value={building.id}>
                    {building.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <select name="method" defaultValue="custom_share">
                <option value="area_sqm">area_sqm</option>
                <option value="unit_count">unit_count</option>
                <option value="occupancy">occupancy</option>
                <option value="custom_share">custom_share</option>
                <option value="meter_weighted">meter_weighted</option>
              </select>
              <input className="input" name="share_value" defaultValue="1" />
            </div>
            <div className="form-row">
              <input className="input" name="allocation_valid_from" type="datetime-local" required />
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" name="allocation_is_default" />
                Default
              </label>
            </div>
            <button type="submit">Create allocation key</button>
          </form>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: 14 }}>
        <h3>Operating cost components</h3>
        <form onSubmit={onCreateOperatingCostComponent}>
          <div className="form-row">
            <input className="input" name="component_name" placeholder="Heating base service fee" required />
            <select name="component_type" defaultValue="fixed">
              <option value="fixed">fixed</option>
              <option value="variable">variable</option>
            </select>
          </div>
          <div className="form-row">
            <input className="input" name="fixed_amount" defaultValue="120" />
            <input className="input" name="variable_rate" defaultValue="0" />
          </div>
          <div className="form-row">
            <select name="allocation_key_id" defaultValue="">
              <option value="">No allocation key</option>
              {allocationKeys.map((key) => (
                <option key={key.id} value={key.id}>
                  {key.name}
                </option>
              ))}
            </select>
            <select name="component_tax_profile_id" defaultValue="">
              <option value="">No tax profile</option>
              {taxProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <select name="component_building_id" defaultValue="">
              <option value="">All buildings</option>
              {buildings.map((building) => (
                <option key={building.id} value={building.id}>
                  {building.name}
                </option>
              ))}
            </select>
            <input className="input" name="component_currency" defaultValue="CHF" maxLength={3} />
          </div>
          <div className="form-row">
            <input className="input" name="component_valid_from" type="datetime-local" required />
            <button type="submit">Create component</button>
          </div>
        </form>
      </section>

      <section className="panel" style={{ marginBottom: 14 }}>
        <h3>Generate draft invoices</h3>
        <form onSubmit={onGenerateDrafts}>
          <div className="form-row">
            <select name="generate_building_id" required>
              <option value="">Building</option>
              {buildings.map((building) => (
                <option key={building.id} value={building.id}>
                  {building.name}
                </option>
              ))}
            </select>
            <select name="billing_period_id" required>
              <option value="">Billing period</option>
              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.name} ({period.building.name})
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <input className="input" name="tax_rate" defaultValue="0.077" />
            <button type="submit">Generate drafts</button>
          </div>
        </form>
      </section>

      <section className="grid two" style={{ marginBottom: 14 }}>
        <div className="panel">
          <h3>Billing periods</h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Building</th>
                  <th>Type</th>
                  <th>Fiscal year</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((period) => (
                  <tr key={period.id}>
                    <td>{period.name}</td>
                    <td>{period.building.name}</td>
                    <td>{period.periodType}</td>
                    <td>{period.fiscalYear ?? "-"}</td>
                    <td>{period.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <h3>Tariffs</h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Meter type</th>
                  <th>Model</th>
                  <th>Price</th>
                  <th>Tax profile</th>
                </tr>
              </thead>
              <tbody>
                {tariffs.map((tariff) => (
                  <tr key={tariff.id}>
                    <td>{tariff.name}</td>
                    <td>{tariff.meterType}</td>
                    <td>{tariff.pricingModel}</td>
                    <td>{tariff.pricePerUnit ?? 0} {tariff.currency}</td>
                    <td>{taxProfiles.find((profile) => profile.id === tariff.taxProfileId)?.name || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="grid two" style={{ marginBottom: 14 }}>
        <div className="panel">
          <h3>Tax profile registry</h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Mode</th>
                  <th>Rate</th>
                  <th>Default</th>
                </tr>
              </thead>
              <tbody>
                {taxProfiles.map((profile) => (
                  <tr key={profile.id}>
                    <td>{profile.name}</td>
                    <td>{profile.taxHandlingMode}</td>
                    <td>{profile.vatRate ?? 0}</td>
                    <td>{profile.isDefault ? "yes" : "no"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <h3>Allocation and operating costs</h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Allocation key</th>
                  <th>Method</th>
                  <th>Default</th>
                </tr>
              </thead>
              <tbody>
                {allocationKeys.map((key) => (
                  <tr key={key.id}>
                    <td>{key.name}</td>
                    <td>{key.method}</td>
                    <td>{key.isDefault ? "yes" : "no"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Component</th>
                  <th>Type</th>
                  <th>Fixed</th>
                  <th>Variable</th>
                </tr>
              </thead>
              <tbody>
                {operatingCostComponents.map((component) => (
                  <tr key={component.id}>
                    <td>{component.name}</td>
                    <td>{component.componentType}</td>
                    <td>{component.fixedAmount ?? 0} {component.currency}</td>
                    <td>{component.variableRate ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="panel">
        <h3>Invoice drafts</h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Building</th>
                <th>Unit</th>
                <th>Period</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((draft) => (
                <tr key={draft.id}>
                  <td>{draft.building.name}</td>
                  <td>{draft.unit?.name || "(building-level)"}</td>
                  <td>{draft.billingPeriod.name}</td>
                  <td>
                    {Number(draft.totalAmount).toFixed(2)} {draft.currency}
                  </td>
                  <td>
                    <span className={`tag ${draft.warningFlags.length > 0 ? "warn" : "ok"}`}>{draft.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 14 }}>
        <h3>Billing change log</h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Module</th>
                <th>Action</th>
                <th>Entity</th>
                <th>User</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {billingChangeLogs.map((entry) => (
                <tr key={entry.id}>
                  <td>{new Date(entry.createdAt).toLocaleString()}</td>
                  <td>{entry.sourceModule}</td>
                  <td>{entry.action}</td>
                  <td>{entry.entityType}</td>
                  <td>{entry.user?.email || "-"}</td>
                  <td>{entry.reason || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
