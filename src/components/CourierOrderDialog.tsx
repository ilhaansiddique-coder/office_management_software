import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWebhookSettings } from "@/hooks/useWebhookSettings";
import { supabase } from "@/integrations/supabase/client";
import { Truck, Package, User, MapPin, AlertCircle, Store, Loader2 } from "lucide-react";
import { toast } from "@/utils/toast";

interface PathaoStore {
  store_id: number;
  store_name: string;
  store_address: string;
  is_active: number;
}

interface PathaoCity {
  city_id: number;
  city_name: string;
}

interface PathaoZone {
  zone_id: number;
  zone_name: string;
}

interface PathaoArea {
  area_id: number;
  area_name: string;
}

// Helper function to normalize text for matching
const normalizeText = (text: string): string => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[,\-\.\/\\]+/g, ' ') // Replace punctuation with spaces
    .replace(/\s+/g, ' ') // Normalize multiple spaces
    .replace(/['"()]/g, ''); // Remove quotes and parentheses
};

// Bangla to English location mapping (comprehensive list)
const banglaToEnglishMap: Record<string, string[]> = {
  // Major Cities
  'ঢাকা': ['dhaka'],
  'চট্টগ্রাম': ['chittagong', 'chattogram'],
  'সিলেট': ['sylhet'],
  'রাজশাহী': ['rajshahi'],
  'খুলনা': ['khulna'],
  'বরিশাল': ['barisal', 'barishal'],
  'রংপুর': ['rangpur'],
  'ময়মনসিংহ': ['mymensingh'],

  // Dhaka Areas/Zones
  'মিরপুর': ['mirpur'],
  'ধানমন্ডি': ['dhanmondi', 'dhanmandi'],
  'উত্তরা': ['uttara'],
  'গুলশান': ['gulshan'],
  'বনানী': ['banani'],
  'মোহাম্মদপুর': ['mohammadpur', 'muhammadpur'],
  'মতিঝিল': ['motijheel', 'motijhil'],
  'খিলগাঁও': ['khilgaon', 'khilgao'],
  'বাড্ডা': ['badda'],
  'রামপুরা': ['rampura'],
  'যাত্রাবাড়ী': ['jatrabari'],
  'শ্যামলী': ['shyamoli', 'shamoli'],
  'ফার্মগেট': ['farmgate'],
  'তেজগাঁও': ['tejgaon'],
  'পল্টন': ['paltan'],
  'শাহবাগ': ['shahbag', 'shahbagh'],
  'নিউমার্কেট': ['newmarket', 'new market'],
  'আজিমপুর': ['azimpur'],
  'লালবাগ': ['lalbagh', 'lalbag'],
  'কামরাঙ্গীরচর': ['kamrangirchar'],
  'হাজারীবাগ': ['hazaribagh', 'hazaribag'],
  'কাফরুল': ['kafrul'],
  'পল্লবী': ['pallabi', 'pallavi'],
  'শাহ আলী': ['shah ali'],
  'রূপনগর': ['rupnagar'],
  'শেওড়াপাড়া': ['shewrapara'],
  'আগারগাঁও': ['agargaon'],
  'মহাখালী': ['mohakhali'],
  'বনশ্রী': ['banasree', 'banashree'],
  'আফতাবনগর': ['aftabnagar'],
  'বসুন্ধরা': ['bashundhara', 'basundhara'],
  'নিকুঞ্জ': ['nikunja', 'nikunjo'],
  'খিলক্ষেত': ['khilkhet'],
  'ডেমরা': ['demra'],
  'সূত্রাপুর': ['sutrapur'],
  'ওয়ারী': ['wari'],
  'কোতোয়ালী': ['kotwali'],
  'সদরঘাট': ['sadarghat'],
  'গেন্ডারিয়া': ['gendaria'],
  'শ্যামপুর': ['shyampur'],
  'কদমতলী': ['kadamtali', 'kadamtoli'],
  'দক্ষিণখান': ['dakshinkhan'],
  'উত্তরখান': ['uttarkhan'],
  'তুরাগ': ['turag'],
  'সাতারকুল': ['satarkul'],
  'বারিধারা': ['baridhara'],

  // Nearby Districts
  'গাজীপুর': ['gazipur', 'gajipur'],
  'নারায়ণগঞ্জ': ['narayanganj'],
  'মুন্সীগঞ্জ': ['munshiganj', 'munshigonj'],
  'মানিকগঞ্জ': ['manikganj', 'manikgonj'],
  'নরসিংদী': ['narsingdi'],
  'সাভার': ['savar'],
  'টঙ্গী': ['tongi', 'tungi'],
  'কেরানীগঞ্জ': ['keraniganj', 'keranigonj'],

  // Munshiganj Areas
  'সিরাজদিখান': ['sirajdikhan', 'sirajdighan'],
  'শ্রীনগর': ['sreenagar', 'shreenagar'],
  'লৌহজং': ['louhajang', 'louhajong'],
  'গজারিয়া': ['gazaria'],
  'টঙ্গীবাড়ী': ['tongibari'],

  // Gazipur Areas
  'কালীগঞ্জ': ['kaliganj', 'kaligonj'],
  'কালিয়াকৈর': ['kaliakair', 'kaliakoir'],
  'কাপাসিয়া': ['kapasia'],
  'শ্রীপুর': ['sripur', 'shripur'],

  // Narayanganj Areas
  'রূপগঞ্জ': ['rupganj', 'rupgonj'],
  'আড়াইহাজার': ['araihazar'],
  'সোনারগাঁও': ['sonargaon', 'sonargao'],
  'বন্দর': ['bandar'],
  'সিদ্ধিরগঞ্জ': ['siddhirganj', 'siddhirgonj'],

  // Chittagong Areas
  'আগ্রাবাদ': ['agrabad'],
  'নাসিরাবাদ': ['nasirabad'],
  'পাঁচলাইশ': ['panchlaish'],
  'হালিশহর': ['halishahar'],
  'পতেঙ্গা': ['patenga'],
  'কালুরঘাট': ['kalurghat'],
  'বায়েজিদ': ['bayezid', 'bayzid'],
  'ফৌজদারহাট': ['fouzdarhat'],
  'সীতাকুন্ড': ['sitakunda', 'sitakundo'],
  'মীরসরাই': ['mirsarai', 'mirsharai'],
  'হাটহাজারী': ['hathazari'],

  // Sylhet Areas
  'জিন্দাবাজার': ['zindabazar', 'jindabazar'],
  'আম্বরখানা': ['amberkhana', 'ambarkhana'],
  'সুবিদবাজার': ['subidbazar'],
  'শাহজালাল': ['shahjalal'],
  'কুমারপাড়া': ['kumarpara'],
  'টিলাগড়': ['tilagarh', 'tilagor'],

  // Common Area Types
  'রোড': ['road'],
  'গলি': ['gali', 'lane'],
  'পাড়া': ['para'],
  'বাজার': ['bazar', 'bazaar', 'market'],
  'হাট': ['hat', 'haat'],
  'ঘাট': ['ghat'],
  'পুর': ['pur', 'pore'],
  'গঞ্জ': ['ganj', 'gonj', 'gong'],
  'নগর': ['nagar', 'nogor'],
  'তলা': ['tala', 'tola'],
  'খান': ['khan'],

  // Comilla/Cumilla
  'কুমিল্লা': ['comilla', 'cumilla', 'kumilla'],
  'চান্দিনা': ['chandina'],
  'দেবিদ্বার': ['debidwar'],
  'বরুড়া': ['barura'],
  'লাকসাম': ['laksam', 'lakshm'],

  // Rajshahi Areas
  'বোয়ালিয়া': ['boalia'],
  'রাজপাড়া': ['rajpara'],
  'শাহমখদুম': ['shahmakhdum'],
  'কাটাখালী': ['katakhali'],

  // Other Districts
  'ফরিদপুর': ['faridpur'],
  'মাদারীপুর': ['madaripur'],
  'শরীয়তপুর': ['shariatpur'],
  'গোপালগঞ্জ': ['gopalganj', 'gopalgonj'],
  'টাঙ্গাইল': ['tangail'],
  'জামালপুর': ['jamalpur'],
  'শেরপুর': ['sherpur'],
  'কিশোরগঞ্জ': ['kishoreganj', 'kishoregonj'],
  'নেত্রকোনা': ['netrokona', 'netrakona'],
  'ব্রাহ্মণবাড়িয়া': ['brahmanbaria'],
  'চাঁদপুর': ['chandpur'],
  'লক্ষ্মীপুর': ['lakshmipur', 'laxmipur'],
  'নোয়াখালী': ['noakhali'],
  'ফেনী': ['feni'],
  'কক্সবাজার': ['coxs bazar', 'coxsbazar', 'cox bazar'],
  'বান্দরবান': ['bandarban'],
  'রাঙ্গামাটি': ['rangamati'],
  'খাগড়াছড়ি': ['khagrachhari', 'khagrachari'],
  'পাবনা': ['pabna'],
  'সিরাজগঞ্জ': ['sirajganj', 'sirajgonj'],
  'বগুড়া': ['bogra', 'bogura'],
  'নওগাঁ': ['naogaon'],
  'চাঁপাইনবাবগঞ্জ': ['chapainawabganj'],
  'জয়পুরহাট': ['joypurhat'],
  'দিনাজপুর': ['dinajpur'],
  'ঠাকুরগাঁও': ['thakurgaon'],
  'পঞ্চগড়': ['panchagarh'],
  'নীলফামারী': ['nilphamari'],
  'লালমনিরহাট': ['lalmonirhat'],
  'কুড়িগ্রাম': ['kurigram'],
  'গাইবান্ধা': ['gaibandha'],
  'যশোর': ['jessore', 'jashore'],
  'নড়াইল': ['narail'],
  'মাগুরা': ['magura'],
  'কুষ্টিয়া': ['kushtia'],
  'মেহেরপুর': ['meherpur'],
  'চুয়াডাঙ্গা': ['chuadanga'],
  'সাতক্ষীরা': ['satkhira'],
  'বাগেরহাট': ['bagerhat'],
  'পিরোজপুর': ['pirojpur'],
  'ঝালকাঠি': ['jhalokati', 'jhalokathi'],
  'পটুয়াখালী': ['patuakhali'],
  'বরগুনা': ['barguna'],
  'ভোলা': ['bhola'],

  // Common suffixes that help matching
  'মধুপুর': ['madhupur'],
  'রাজানগর': ['rajanagar', 'raj nagar'],
  'শাহী': ['shahi'],
};

// Smart location matching function with Bangla support
const findBestLocationMatch = <T extends { id: number; name: string }>(
  address: string,
  locations: T[]
): T | null => {
  if (!address || locations.length === 0) return null;

  const normalizedAddress = normalizeText(address);
  const addressWords = normalizedAddress.split(' ').filter(w => w.length > 1);

  // Also keep original address for Bangla matching
  const originalAddress = address.trim();

  let bestMatch: T | null = null;
  let bestScore = 0;

  for (const location of locations) {
    const normalizedName = normalizeText(location.name);
    const nameWords = normalizedName.split(' ').filter(w => w.length > 1);

    let totalScore = 0;

    // Score 1: Exact match in English (highest priority)
    if (normalizedAddress.includes(normalizedName)) {
      totalScore = 100 + normalizedName.length; // Longer matches are better
    }

    // Score 2: Check Bangla text matches
    for (const [bangla, englishVariants] of Object.entries(banglaToEnglishMap)) {
      // Check if address contains Bangla word
      if (originalAddress.includes(bangla)) {
        // Check if any English variant matches the location name
        for (const englishVariant of englishVariants) {
          if (normalizedName.includes(englishVariant) || englishVariant.includes(normalizedName)) {
            const banglaScore = 95 + englishVariant.length;
            if (banglaScore > totalScore) {
              totalScore = banglaScore;
            }
          }
        }
      }
    }

    // Score 3: Word-by-word matching (English)
    if (totalScore < 90) {
      let wordMatchScore = 0;
      for (const nameWord of nameWords) {
        for (const addrWord of addressWords) {
          if (addrWord === nameWord) {
            wordMatchScore += 10; // Exact word match
          } else if (addrWord.startsWith(nameWord) || nameWord.startsWith(addrWord)) {
            wordMatchScore += 5; // Partial word match
          } else if (addrWord.includes(nameWord) || nameWord.includes(addrWord)) {
            wordMatchScore += 3; // Contains match
          }
        }
      }

      // Score 4: Handle common English variations (transliterations)
      const variations: Record<string, string[]> = {
        'dhaka': ['dhka', 'daka'],
        'chittagong': ['chattogram', 'ctg', 'chittagng'],
        'mirpur': ['mirpure', 'mirpr'],
        'dhanmondi': ['dhanmandi', 'dhanmond', 'dhanmodi'],
        'uttara': ['uttora', 'uttra'],
        'gulshan': ['gulshn', 'gulsan'],
        'banani': ['bannani', 'bananny'],
        'mohammadpur': ['muhammadpur', 'mohammedpur', 'mohmdpur'],
        'motijheel': ['motijhil', 'motijeel', 'motijhl'],
        'khilgaon': ['khilgao', 'khilgawn', 'kilgaon'],
        'badda': ['bada', 'baddha'],
        'rampura': ['rampur', 'rampurah'],
        'jatrabari': ['jatrabary', 'jatrabar'],
        'shyamoli': ['shymoli', 'shamoli', 'shyamoly'],
        'farmgate': ['farm gate', 'farmgt'],
        'tejgaon': ['tejgao', 'tejgawn'],
        'paltan': ['pltan', 'poltan'],
        'sylhet': ['silhet', 'sylht'],
        'rajshahi': ['rajshshi', 'rajsahi'],
        'khulna': ['khulnaa', 'kulna'],
        'gazipur': ['gajipur', 'ghazipur'],
        'narayanganj': ['naraynganj', 'nrayanganj', 'narayangonj'],
        'comilla': ['cumilla', 'comillah', 'kumilla'],
        'tongi': ['tungi', 'tongy'],
        'savar': ['sabar', 'sabhar'],
        'munshiganj': ['munshigonj', 'munshi ganj'],
        'sirajdikhan': ['sirajdighan', 'siraj dikhan'],
      };

      for (const [standard, varList] of Object.entries(variations)) {
        const allForms = [standard, ...varList];
        const nameHasVariant = allForms.some(v => normalizedName.includes(v));
        const addressHasVariant = allForms.some(v => normalizedAddress.includes(v));

        if (nameHasVariant && addressHasVariant) {
          wordMatchScore += 8;
        }
      }

      if (wordMatchScore > totalScore) {
        totalScore = wordMatchScore;
      }
    }

    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestMatch = location;
    }
  }

  // Only return match if score is above threshold
  return bestScore >= 5 ? bestMatch : null;
};

interface CourierOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleId: string | null;
}

interface CourierOrderData {
  sale_id: string;
  invoice_number: string;
  recipient_name: string;
  recipient_phone: string;
  recipient_address: string;
  item_description: string;
  amount_to_collect: number;
  total_items: number;
  order_date: string;
  special_instruction: string;
  items: Array<{
    name: string;
    quantity: number;
    rate: number;
    variant: Record<string, any> | null;
  }>;
}

export const CourierOrderDialog = ({ open, onOpenChange, saleId }: CourierOrderDialogProps) => {
  const { webhookSettings, isCourierReady } = useWebhookSettings();
  const [orderData, setOrderData] = useState<CourierOrderData>({
    sale_id: "",
    invoice_number: "",
    recipient_name: "",
    recipient_phone: "",
    recipient_address: "",
    item_description: "",
    amount_to_collect: 0,
    total_items: 0,
    order_date: "",
    special_instruction: "",
    items: []
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  /* State to store the courier name */
  const [courierName, setCourierName] = useState<string>("");

  /* Pathao store selection */
  const [pathaoStores, setPathaoStores] = useState<PathaoStore[]>([]);
  const [selectedPathaoStore, setSelectedPathaoStore] = useState<string>("");
  const [isLoadingStores, setIsLoadingStores] = useState(false);

  /* Pathao city/zone/area selection */
  const [pathaoCities, setPathaoCities] = useState<PathaoCity[]>([]);
  const [pathaoZones, setPathaoZones] = useState<PathaoZone[]>([]);
  const [pathaoAreas, setPathaoAreas] = useState<PathaoArea[]>([]);
  const [selectedCity, setSelectedCity] = useState<string>("");
  const [selectedZone, setSelectedZone] = useState<string>("");
  const [selectedArea, setSelectedArea] = useState<string>("");
  const [isLoadingCities, setIsLoadingCities] = useState(false);
  const [isLoadingZones, setIsLoadingZones] = useState(false);
  const [isLoadingAreas, setIsLoadingAreas] = useState(false);

  useEffect(() => {
    const fetchSaleData = async () => {
      if (!saleId || !open) return;

      try {
        // Get sale data from the sales list or make direct queries
        const { data: sale, error: saleError } = await supabase
          .from('sales')
          .select('*')
          .eq('id', saleId)
          .single();

        const { data: saleItems, error: itemsError } = await supabase
          .from('sales_items')
          .select('*, product_variants!left(attributes)')
          .eq('sale_id', saleId);

        if (saleError || itemsError) {
          throw new Error('Failed to fetch sale data');
        }

        if (sale && saleItems) {
          setCourierName(sale.courier_name || "");

          // Build item description with grouped variants
          const groupedItems: Record<string, any[]> = {};
          saleItems.forEach((item: any) => {
            if (!groupedItems[item.product_name]) {
              groupedItems[item.product_name] = [];
            }
            groupedItems[item.product_name].push(item);
          });

          const itemDescriptions = Object.entries(groupedItems).map(([productName, items]) => {
            const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);

            // Build variant string
            const variants = items.map(item => {
              let variantObj = item.product_variants?.attributes;

              // Handle JSON string variants
              if (typeof variantObj === 'string') {
                try {
                  variantObj = JSON.parse(variantObj);
                } catch (e) {
                  return null;
                }
              }

              if (variantObj && typeof variantObj === 'object') {
                const variantValues = Object.entries(variantObj)
                  .filter(([key]) => key.trim().length > 1)
                  .map(([_, value]) => String(value).trim())
                  .join(', ');
                return variantValues ? `${variantValues}(${item.quantity})` : null;
              }
              return null;
            }).filter(Boolean);

            if (variants.length > 0) {
              return `${productName}* ${variants.join(' + ')}`;
            }
            return `${productName} x${totalQty}`;
          }).join(', ');

          // Truncate item_description to 255 characters for Steadfast API
          const truncatedItemDescription = itemDescriptions.length > 255
            ? itemDescriptions.substring(0, 252) + '...'
            : itemDescriptions;

          const items = saleItems.map((item: any) => ({
            name: item.product_name,
            quantity: item.quantity,
            rate: parseFloat(item.rate),
            variant: item.product_variants?.attributes || null
          }));

          setOrderData({
            sale_id: sale.id,
            invoice_number: sale.invoice_number,
            recipient_name: sale.customer_name,
            recipient_phone: sale.customer_phone || "",
            recipient_address: sale.customer_address || "",
            item_description: truncatedItemDescription,
            amount_to_collect: parseFloat((sale.amount_due ?? sale.grand_total).toString()),
            total_items: saleItems.reduce((sum: number, item: any) => sum + item.quantity, 0),
            order_date: sale.created_at,
            special_instruction: "",
            items
          });
        }
      } catch (error) {
        console.error("Error fetching sale data:", error);
        toast.error("Failed to load sale data");
      }
    };

    fetchSaleData();
  }, [saleId, open]);

  // Fetch Pathao stores when Pathao is selected
  useEffect(() => {
    const fetchPathaoStores = async () => {
      if (!courierName.toLowerCase().includes('pathao')) return;
      if (!webhookSettings?.pathao_access_token) return;

      setIsLoadingStores(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session?.access_token) return;

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pathao-proxy`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${sessionData.session.access_token}`,
            },
            body: JSON.stringify({ action: 'get_stores' }),
          }
        );

        const result = await response.json();
        if (result.success) {
          const stores = result.data?.data?.data || result.data?.data || [];
          setPathaoStores(stores);
          // Set default store if configured
          if (webhookSettings?.pathao_store_id) {
            setSelectedPathaoStore(webhookSettings.pathao_store_id);
          } else if (stores.length > 0) {
            setSelectedPathaoStore(String(stores[0].store_id));
          }
        }
      } catch (error) {
        console.error('Error fetching Pathao stores:', error);
      } finally {
        setIsLoadingStores(false);
      }
    };

    fetchPathaoStores();
  }, [courierName, webhookSettings?.pathao_access_token, webhookSettings?.pathao_store_id]);

  // Fetch Pathao cities when Pathao is selected
  useEffect(() => {
    const fetchPathaoCities = async () => {
      if (!courierName.toLowerCase().includes('pathao')) return;
      if (!webhookSettings?.pathao_access_token) return;

      setIsLoadingCities(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session?.access_token) return;

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pathao-proxy`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${sessionData.session.access_token}`,
            },
            body: JSON.stringify({ action: 'get_cities' }),
          }
        );

        const result = await response.json();
        if (result.success) {
          const cities = result.data?.data?.data || result.data?.data || [];
          setPathaoCities(cities);

          // Auto-match city from address
          const address = orderData.recipient_address;
          if (address && cities.length > 0) {
            const citiesForMatch = cities.map((c: PathaoCity) => ({
              id: c.city_id,
              name: c.city_name
            }));
            const matchedCity = findBestLocationMatch(address, citiesForMatch);
            if (matchedCity) {
              console.log('Auto-matched city:', matchedCity.name);
              setSelectedCity(String(matchedCity.id));
              return; // Found a match, don't use default
            }
          }

          // Default to Dhaka (city_id: 1) if no match found
          const dhaka = cities.find((c: PathaoCity) => c.city_id === 1);
          if (dhaka) {
            setSelectedCity("1");
          } else if (cities.length > 0) {
            setSelectedCity(String(cities[0].city_id));
          }
        }
      } catch (error) {
        console.error('Error fetching Pathao cities:', error);
      } finally {
        setIsLoadingCities(false);
      }
    };

    fetchPathaoCities();
  }, [courierName, webhookSettings?.pathao_access_token, orderData.recipient_address]);

  // Fetch Pathao zones when city is selected
  useEffect(() => {
    const fetchPathaoZones = async () => {
      if (!selectedCity) {
        setPathaoZones([]);
        setSelectedZone("");
        return;
      }

      setIsLoadingZones(true);
      setPathaoAreas([]); // Clear areas when city changes
      setSelectedArea("");
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session?.access_token) return;

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pathao-proxy`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${sessionData.session.access_token}`,
            },
            body: JSON.stringify({ action: 'get_zones', city_id: parseInt(selectedCity) }),
          }
        );

        const result = await response.json();
        if (result.success) {
          const zones = result.data?.data?.data || result.data?.data || [];
          setPathaoZones(zones);

          // Auto-match zone from address
          const address = orderData.recipient_address;
          if (address && zones.length > 0) {
            const zonesForMatch = zones.map((z: PathaoZone) => ({
              id: z.zone_id,
              name: z.zone_name
            }));
            const matchedZone = findBestLocationMatch(address, zonesForMatch);
            if (matchedZone) {
              console.log('Auto-matched zone:', matchedZone.name);
              setSelectedZone(String(matchedZone.id));
              return; // Found a match, don't use default
            }
          }

          // Default to first zone if no match found
          if (zones.length > 0) {
            setSelectedZone(String(zones[0].zone_id));
          }
        }
      } catch (error) {
        console.error('Error fetching Pathao zones:', error);
      } finally {
        setIsLoadingZones(false);
      }
    };

    fetchPathaoZones();
  }, [selectedCity, orderData.recipient_address]);

  // Fetch Pathao areas when zone is selected
  useEffect(() => {
    const fetchPathaoAreas = async () => {
      if (!selectedZone) {
        setPathaoAreas([]);
        setSelectedArea("");
        return;
      }

      setIsLoadingAreas(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session?.access_token) return;

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pathao-proxy`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${sessionData.session.access_token}`,
            },
            body: JSON.stringify({ action: 'get_areas', zone_id: parseInt(selectedZone) }),
          }
        );

        const result = await response.json();
        if (result.success) {
          const areas = result.data?.data?.data || result.data?.data || [];
          setPathaoAreas(areas);

          // Auto-match area from address (optional field but helpful)
          const address = orderData.recipient_address;
          if (address && areas.length > 0) {
            const areasForMatch = areas.map((a: PathaoArea) => ({
              id: a.area_id,
              name: a.area_name
            }));
            const matchedArea = findBestLocationMatch(address, areasForMatch);
            if (matchedArea) {
              console.log('Auto-matched area:', matchedArea.name);
              setSelectedArea(String(matchedArea.id));
            }
            // If no match, leave area unselected (it's optional)
          }
        }
      } catch (error) {
        console.error('Error fetching Pathao areas:', error);
      } finally {
        setIsLoadingAreas(false);
      }
    };

    fetchPathaoAreas();
  }, [selectedZone, orderData.recipient_address]);

  const handleSubmitOrder = async () => {
    // Check courier type
    // Check courier type (normalize for comparison)
    const normalizedCourier = (courierName || "").trim().toLowerCase();
    const isSteadfast = normalizedCourier.includes("steadfast");
    const isPathao = normalizedCourier.includes("pathao");

    // Validate courier is configured and enabled
    if (isSteadfast) {
      if (!isCourierReady('Steadfast')) {
        toast.error("Steadfast is not configured or enabled. Please configure it in Admin → System → Courier Settings.");
        return;
      }
    } else if (isPathao) {
      if (!isCourierReady('Pathao')) {
        toast.error("Pathao is not configured or enabled. Please configure it in Admin → System → Courier Settings.");
        return;
      }
      if (!selectedPathaoStore && !webhookSettings?.pathao_store_id) {
        toast.error("Please select a Pathao store before sending the order.");
        return;
      }
      if (!selectedCity || !selectedZone) {
        toast.error("Please select delivery city and zone for Pathao order.");
        return;
      }
    } else {
      // Generic webhook courier
      if (!webhookSettings?.webhook_url) {
        toast.error("No webhook URL configured. Please configure your courier webhook in Settings.");
        return;
      }
      if (!webhookSettings.is_active) {
        toast.error("Courier webhook is disabled. Please enable it in Settings.");
        return;
      }
    }

    if (!orderData.recipient_name || !orderData.recipient_phone || !orderData.recipient_address) {
      toast.error("Please fill in all required recipient information");
      return;
    }

    setIsSubmitting(true);

    try {
      // Send order via Edge Function to avoid exposing webhook secrets in the client
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session?.access_token) {
        throw new Error('Authentication required');
      }

      // Determine endpoint based on courier type
      const endpoint = isSteadfast
        ? 'steadfast-create-order'
        : isPathao
          ? 'pathao-create-order'
          : 'courier-webhook';

      // Clean phone number: remove all non-digit characters (spaces, dashes, special chars)
      const cleanedPhone = orderData.recipient_phone.replace(/\D/g, '');

      // Build payload based on courier type
      let payload: any;
      if (isSteadfast) {
        payload = {
          sale_id: orderData.sale_id,
          invoice_number: orderData.invoice_number,
          recipient_name: orderData.recipient_name,
          recipient_phone: cleanedPhone,
          recipient_address: orderData.recipient_address,
          cod_amount: orderData.amount_to_collect,
          note: orderData.special_instruction,
          item_description: orderData.item_description
        };
      } else if (isPathao) {
        payload = {
          sale_id: orderData.sale_id,
          invoice_number: orderData.invoice_number,
          store_id: selectedPathaoStore || webhookSettings?.pathao_store_id,
          recipient_name: orderData.recipient_name,
          recipient_phone: cleanedPhone,
          recipient_address: orderData.recipient_address,
          recipient_city: parseInt(selectedCity) || 1, // Use selected city
          recipient_zone: parseInt(selectedZone) || 1, // Use selected zone
          recipient_area: selectedArea && selectedArea !== "none" ? parseInt(selectedArea) : undefined, // Optional area
          cod_amount: orderData.amount_to_collect,
          note: orderData.special_instruction,
          item_description: orderData.item_description,
          item_quantity: orderData.total_items,
          item_weight: 0.5 // Default weight
        };
      } else {
        payload = {
          ...orderData,
          note: orderData.special_instruction
        };
      }

      console.log('=== COURIER ORDER DEBUG ===');
      console.log('Courier Name:', courierName);
      console.log('Is Steadfast:', isSteadfast);
      console.log('Is Pathao:', isPathao);
      console.log('Special Instruction:', orderData.special_instruction);
      console.log('Payload being sent:', JSON.stringify(payload, null, 2));
      console.log('=== END DEBUG ===');

      const webhookResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${endpoint}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionData.session.access_token}`,
          },
          body: JSON.stringify(payload),
        }
      );

      const result = await webhookResponse.json();
      if (!webhookResponse.ok) {
        throw new Error(result?.message || `Error (${webhookResponse.status})`);
      }

      // Handle response based on integration type
      let consignmentId = null;
      let trackingCode = null; // Tracking code for public tracking timeline
      let successMessage = "";
      let courierStatus = 'not_sent'; // Default status - order sent but not yet picked up

      if (isSteadfast) {
        consignmentId = result.consignment_id;
        trackingCode = result.tracking_code; // Capture tracking code (e.g., SFR260210ST210D6F1BD)
        courierStatus = 'not_sent'; // Always set to 'not_sent' immediately after sending
        successMessage = `Order sent to Steadfast! CID: ${consignmentId}`;
        if (trackingCode) {
          successMessage += `, Tracking: ${trackingCode}`;
        }
      } else if (isPathao) {
        consignmentId = result.consignment_id;
        trackingCode = result.tracking_code;
        courierStatus = 'not_sent'; // Always set to 'not_sent' immediately after sending
        successMessage = `Order sent to Pathao! CID: ${consignmentId}`;
        if (trackingCode) {
          successMessage += `, Tracking: ${trackingCode}`;
        }
      } else {
        // Generic webhook response handling
        const webhookName = webhookSettings?.webhook_name || 'Courier Service';
        if (result?.consignment_id) {
          consignmentId = result.consignment_id;
        } else if (result?.webhook_response) {
          const responseData = result.webhook_response;
          if (Array.isArray(responseData) && responseData.length > 0) {
            const firstResponse = responseData[0];
            if (firstResponse?.data?.consignment_id) {
              consignmentId = firstResponse.data.consignment_id;
            }
          } else if (responseData?.consignment_id) {
            consignmentId = responseData.consignment_id;
          } else if (responseData?.tracking_id) {
            consignmentId = responseData.tracking_id;
          } else if (responseData?.order_id) {
            consignmentId = responseData.order_id;
          }
        }
        successMessage = `Order successfully sent to ${webhookName}! Tracking ID: ${consignmentId || 'Generated'}`;
      }

      console.log('Processed order, consignment_id:', consignmentId);

      // Explicitly update the sale in database to ensure immediate sync
      if (consignmentId) {
        const updatePayload: any = {
          consignment_id: consignmentId,
          cn_number: consignmentId,
          courier_status: courierStatus, // Use the status from API response
          last_status_check: new Date().toISOString()
        };

        // Add tracking_number (tracking code) for public tracking timeline
        if (trackingCode) {
          updatePayload.tracking_number = trackingCode;
        }

        // Add note to the update payload if it exists
        if (orderData.special_instruction) {
          updatePayload.courier_notes = orderData.special_instruction;
        }

        const { error: updateError } = await supabase
          .from('sales')
          .update(updatePayload)
          .eq('id', orderData.sale_id);

        if (updateError) {
          console.error('Error updating sale locally:', updateError);
          toast.error(`Warning: Order sent but failed to update local database: ${updateError.message}`);
        } else {
          console.log('Successfully updated sale locally with consignment_id:', consignmentId);
          console.log('Update payload used:', JSON.stringify(updatePayload, null, 2));
        }
      } else {
        console.warn('No consignment_id received, skipping local database update');
      }

      toast.success(successMessage);

      // Close dialog first
      onOpenChange(false);

      // Notify parent component to refresh sales data
      // Use setTimeout to ensure the dialog closes and database update completes before refresh
      setTimeout(() => {
        console.log('Dispatching salesDataUpdated event');
        window.dispatchEvent(new CustomEvent('salesDataUpdated'));
      }, 200); // Increased from 100ms to 200ms for more reliable refresh
    } catch (error: any) {
      console.error("Error sending order:", error);
      toast.error(error.message || "Failed to send order. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check if courier is ready to send
  const isSteadfastSelected = courierName === 'Steadfast';
  const isPathaoSelected = courierName === 'Pathao';

  // Check if the selected courier is configured and enabled
  const isCourierConfiguredAndEnabled = () => {
    if (isSteadfastSelected) return isCourierReady('Steadfast');
    if (isPathaoSelected) {
      // Pathao needs store, city, and zone selected
      return isCourierReady('Pathao') &&
        !!(selectedPathaoStore || webhookSettings?.pathao_store_id) &&
        !!selectedCity &&
        !!selectedZone;
    }
    // For other couriers, check generic webhook
    return !!(webhookSettings?.webhook_url && webhookSettings?.is_active);
  };

  const canSendToCourier = courierName && isCourierConfiguredAndEnabled();

  // Warning message for unconfigured courier
  const getWarningMessage = () => {
    if (!courierName) return "No courier selected for this order.";
    if (isSteadfastSelected && !isCourierReady('Steadfast')) {
      return "Steadfast is not configured or enabled. Configure it in Admin → System → Courier Settings.";
    }
    if (isPathaoSelected) {
      if (!isCourierReady('Pathao')) {
        return "Pathao is not configured or enabled. Configure it in Admin → System → Courier Settings.";
      }
      if (!selectedCity || !selectedZone) {
        return "Please select delivery city and zone for Pathao order.";
      }
    }
    if (!isSteadfastSelected && !isPathaoSelected && !(webhookSettings?.webhook_url && webhookSettings?.is_active)) {
      return "No webhook configured for this courier. Configure it in Admin → System → Courier Settings.";
    }
    return null;
  };

  const warningMessage = getWarningMessage();

  if (!courierName) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-full sm:max-w-lg md:max-w-2xl lg:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              Courier Service
            </DialogTitle>
          </DialogHeader>
          <div className="text-center py-6">
            <AlertCircle className="h-12 w-12 text-warning mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">
              No courier selected for this order. Please select a courier in the sale details first.
            </p>
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-full sm:max-w-3xl lg:max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border border-base-content/20 bg-base-100 p-0">
        <DialogHeader className="sticky top-0 z-10 border-b border-base-content/15 bg-base-100/95 px-4 py-3 backdrop-blur-sm sm:px-5">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Truck className="h-5 w-5" />
            Send Order to Courier {webhookSettings.webhook_name ? `(${webhookSettings.webhook_name})` : ''}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 px-4 pb-4 pt-3 sm:px-5">
          {/* Warning if courier not configured */}
          {warningMessage && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-warning/12 border border-warning/35 text-warning dark:bg-warning/50 dark:border-warning/50 dark:text-warning/80">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <p className="text-sm">{warningMessage}</p>
            </div>
          )}

          {/* Order Summary */}
          <Card className="rounded-xl border-base-content/20 bg-base-100 shadow-sm">
            <CardHeader className="px-4 pb-2 pt-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Package className="h-4 w-4" />
                Order Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-4 pb-4">
              <div className="flex justify-between">
                <span>Invoice:</span>
                <span className="font-medium">{orderData.invoice_number}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Items:</span>
                <span className="font-medium">{orderData.total_items}</span>
              </div>
              <div className="flex justify-between">
                <span>Amount to Collect:</span>
                <span className="font-medium">৳{orderData.amount_to_collect}</span>
              </div>

              {/* Items Table */}
              <div className="pt-1">
                <span className="text-sm font-medium text-muted-foreground mb-2 block">Order Items:</span>
                <div className="max-h-56 overflow-y-auto rounded-lg border border-base-content/20">
                  <table className="w-full text-sm">
                    <thead className="bg-base-200/60">
                      <tr>
                        <th className="text-left p-2 font-medium">Product</th>
                        <th className="text-center p-2 font-medium w-20">Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(() => {
                        // Group items by product name
                        const grouped = orderData.items.reduce((acc: any, item) => {
                          if (!acc[item.name]) {
                            acc[item.name] = [];
                          }
                          acc[item.name].push(item);
                          return acc;
                        }, {});

                        return Object.entries(grouped).map(([productName, items]: [string, any]) => {
                          const totalQty = items.reduce((sum: number, item: any) => sum + item.quantity, 0);


                          // Build variant display string
                          const variantDisplay = items.map((item: any) => {
                            // Debug: Log all items
                            console.log(`Processing item for ${productName}:`, {
                              name: item.name,
                              quantity: item.quantity,
                              variant: item.variant
                            });

                            if (item.variant) {
                              let variantObj = item.variant;

                              // If variant is a JSON string, parse it
                              if (typeof item.variant === 'string') {
                                try {
                                  variantObj = JSON.parse(item.variant);
                                } catch (e) {
                                  console.error(`Failed to parse variant for ${productName}:`, item.variant);
                                  return null;
                                }
                              }

                              // Now process the variant object
                              if (typeof variantObj === 'object' && variantObj !== null) {
                                // Debug: Log variant structure
                                console.log(`Variant for ${productName}:`, variantObj);

                                // Filter out single-character keys and trim whitespace
                                const validEntries = Object.entries(variantObj)
                                  .filter(([key]) => key.trim().length > 1)
                                  .map(([key, value]) => [key.trim(), String(value).trim()]);

                                console.log(`Valid entries for ${productName}:`, validEntries);

                                if (validEntries.length === 0) return null;

                                // Format as "Value" only (simpler display)
                                const variantStr = validEntries
                                  .map(([key, value]) => `${value}`)
                                  .join(', ');
                                return `${variantStr}(${item.quantity})`;
                              }
                            }
                            return null;
                          }).filter(Boolean).join(' + ');

                          return (
                            <tr key={productName} className="hover:bg-muted/30">
                              <td className="p-2">
                                <div className="font-medium">{productName}</div>
                                {variantDisplay && (
                                  <div className="text-xs text-muted-foreground mt-0.5">
                                    * {variantDisplay}
                                  </div>
                                )}
                              </td>
                              <td className="p-2 text-center font-medium">{totalQty}</td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recipient Information */}
          <Card className="rounded-xl border-base-content/20 bg-base-100 shadow-sm">
            <CardHeader className="px-4 pb-2 pt-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="h-4 w-4" />
                Recipient Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-4 pb-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                <Label htmlFor="recipient_name">Recipient Name *</Label>
                <Input
                  id="recipient_name"
                  value={orderData.recipient_name}
                  onChange={(e) => setOrderData(prev => ({ ...prev, recipient_name: e.target.value }))}
                  className="h-10"
                  required
                />
                </div>

                <div className="space-y-2">
                <Label htmlFor="recipient_phone">Phone Number *</Label>
                <Input
                  id="recipient_phone"
                  value={orderData.recipient_phone}
                  onChange={(e) => setOrderData(prev => ({ ...prev, recipient_phone: e.target.value }))}
                  className="h-10"
                  required
                />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="recipient_address">Address *</Label>
                <Textarea
                  id="recipient_address"
                  value={orderData.recipient_address}
                  onChange={(e) => setOrderData(prev => ({ ...prev, recipient_address: e.target.value }))}
                  rows={3}
                  required
                />
              </div>
            </CardContent>
          </Card>

          {/* Pathao Store Selection (only for Pathao) */}
          {courierName.toLowerCase().includes('pathao') && webhookSettings?.pathao_access_token && (
            <Card className="rounded-xl border-base-content/20 bg-base-100 shadow-sm">
              <CardHeader className="px-4 pb-2 pt-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Store className="h-4 w-4" />
                  Pathao Store
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="space-y-2">
                  <Label htmlFor="pathao_store">Select Store *</Label>
                  {isLoadingStores ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading stores...
                    </div>
                  ) : (
                    <Select value={selectedPathaoStore} onValueChange={setSelectedPathaoStore}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a store" />
                      </SelectTrigger>
                      <SelectContent>
                        {pathaoStores.map((store) => (
                          <SelectItem key={store.store_id} value={String(store.store_id)}>
                            {store.store_name} {store.is_active === 0 && "(Inactive)"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {pathaoStores.length === 0 && !isLoadingStores && (
                    <p className="text-xs text-warning">
                      No stores found. Please configure stores in Pathao merchant panel.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Pathao Location Selection (only for Pathao) */}
          {courierName.toLowerCase().includes('pathao') && webhookSettings?.pathao_access_token && (
            <Card className="rounded-xl border-base-content/20 bg-base-100 shadow-sm">
              <CardHeader className="px-4 pb-2 pt-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <MapPin className="h-4 w-4" />
                  Delivery Location
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 px-4 pb-4">
                {/* City Selection */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                  <Label htmlFor="pathao_city">City *</Label>
                  {isLoadingCities ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading cities...
                    </div>
                  ) : (
                    <Select value={selectedCity} onValueChange={setSelectedCity}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a city" />
                      </SelectTrigger>
                      <SelectContent>
                        {pathaoCities.map((city) => (
                          <SelectItem key={city.city_id} value={String(city.city_id)}>
                            {city.city_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  </div>

                {/* Zone Selection */}
                <div className="space-y-2">
                  <Label htmlFor="pathao_zone">Zone *</Label>
                  {isLoadingZones ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading zones...
                    </div>
                  ) : (
                    <Select
                      value={selectedZone}
                      onValueChange={setSelectedZone}
                      disabled={!selectedCity || pathaoZones.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={!selectedCity ? "Select city first" : "Select a zone"} />
                      </SelectTrigger>
                      <SelectContent>
                        {pathaoZones.map((zone) => (
                          <SelectItem key={zone.zone_id} value={String(zone.zone_id)}>
                            {zone.zone_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                </div>

                {/* Area Selection (Optional) */}
                <div className="space-y-2">
                  <Label htmlFor="pathao_area">Area (Optional)</Label>
                  {isLoadingAreas ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading areas...
                    </div>
                  ) : (
                    <Select
                      value={selectedArea}
                      onValueChange={setSelectedArea}
                      disabled={!selectedZone || pathaoAreas.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={!selectedZone ? "Select zone first" : "Select an area (optional)"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None (Optional)</SelectItem>
                        {pathaoAreas.map((area) => (
                          <SelectItem key={area.area_id} value={String(area.area_id)}>
                            {area.area_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Additional Information */}
          <Card className="rounded-xl border-base-content/20 bg-base-100 shadow-sm">
            <CardHeader className="px-4 pb-2 pt-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="h-4 w-4" />
                Additional Information
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-2">
                <Label htmlFor="special_instruction">Special Instructions</Label>
                <Textarea
                  id="special_instruction"
                  placeholder="Any special delivery instructions..."
                  value={orderData.special_instruction}
                  onChange={(e) => setOrderData(prev => ({ ...prev, special_instruction: e.target.value }))}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 border-t border-base-content/15 pt-3">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="h-10 px-4">
              Cancel
            </Button>
            <Button
              onClick={handleSubmitOrder}
              disabled={isSubmitting || !canSendToCourier}
              className="h-10 min-w-[190px] justify-center"
            >
              <Truck className="h-4 w-4 mr-2" />
              {isSubmitting ? "Sending..." : `Send to ${courierName || 'Courier'}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
